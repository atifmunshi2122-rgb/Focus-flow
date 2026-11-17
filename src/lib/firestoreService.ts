import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  Unsubscribe,
  DocumentReference,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  getDaysInMonth,
  getStartOfWeek,
  formatYmd,
  parseDateString,
  formatDateInTimezone,
} from './dateTime.ts';
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
  SubtaskItem,
  TaskRecurrence,
  SavingsGoal,
  TrashRecord,
  NotificationPreferences,
  DashboardLayoutConfig,
  TimeBlock,
  Habit,
  BudgetEnvelope,
  SubscriptionPlan,
  AuditLogEntry,
  DurableSyncOperation,
  CursorPage,
  AcademicTier,
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyMistake,
  StudyGoal,
  StudyPlan,
  StudyPlanTask,
  StudyResource,
  StudyExam,
  StudyNote,
  StudyActivityLog,
  StudyFlashcard,
  StudyQuiz,
  PomodoroSettings,
  PomodoroGoal,
  PomodoroPreset,
  PomodoroInterruption,
  PomodoroAmbientPreset,
} from '../types/index.ts';
import {
  JointVault,
  VaultMember,
  VaultInvitation,
  VaultContribution,
  VaultExpense,
  VaultSettlement,
  VaultActivity,
  VaultSummary,
  ExpenseSplitMode,
} from '../types/vault.ts';
import {
  isValidRatio,
  splitExpense,
  buildVaultSummary,
} from './vaultIntelligence.ts';
import { processRevisionRecall } from './studyIntelligence.ts';
import { clientDataCache } from './dataCache.ts';

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

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabled: true,
  taskDeadlines: true,
  upcomingBills: true,
  billLeadDays: 3,
  overdueBills: true,
  focusCompletion: true,
  dailyFocusGoal: true,
  budgetWarnings: true,
  budgetWarningPercent: 80,
  syncFailures: true,
};

const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  preset: 'executive',
  widgetOrder: [
    'clock_greeting',
    'hero',
    'focus_kpis',
    'finance_kpis',
    'productivity_goals',
    'gamification',
    'upcoming_bills',
    'recent_transactions',
  ],
  hiddenWidgets: [],
  widgetSizes: {},
};

function defaultSettingsForUser(userId: string): UserSettings {
  return {
    userId,
    currency: 'INR',
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
    dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    favoriteStyleIds: [],
    favoriteThemeIds: [],
    keyboardShortcutsEnabled: true,
  };
}

function isIsoDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const parsed = new Date(`${val}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === val;
}

function parseSubtasks(raw: unknown): SubtaskItem[] {
  if (!Array.isArray(raw)) return [];
  const items: SubtaskItem[] = [];
  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 200) : '';
    if (!title) continue;
    items.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `sub_${Date.now()}_${i}`,
      title,
      done: Boolean(obj.done),
    });
  }
  return items;
}

function computeNextRecurrenceDueDate(
  currentDueDate: string | null | undefined,
  recurrence: TaskRecurrence
): string | null {
  if (recurrence === 'none') return null;
  const baseStr =
    currentDueDate && isIsoDate(currentDueDate)
      ? currentDueDate
      : new Date().toISOString().slice(0, 10);
  const d = new Date(`${baseStr}T00:00:00.000Z`);
  if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function computeBestStreakDays(sessions: FocusSession[]): number {
  const dates = Array.from(
    new Set(
      sessions
        .filter((s) => s && s.completed && s.mode === 'work' && typeof s.startedAt === 'string')
        .map((s) => s.startedAt.slice(0, 10))
        .filter((d) => isIsoDate(d))
    )
  ).sort();
  if (dates.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T00:00:00.000Z`);
    const next = new Date(`${dates[i]}T00:00:00.000Z`);
    const diffDays = Math.round((next.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) {
      current++;
      if (current > best) best = current;
    } else if (diffDays > 1) {
      current = 1;
    }
  }
  return best;
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
        const safeEmail = (fbUser.email || 'user@focusflow.app').trim().slice(0, 256) || 'user@focusflow.app';
        const safeName = (fbUser.displayName || 'Focus User').trim().slice(0, 128) || 'Focus User';
        user = {
          id: userId,
          email: safeEmail,
          name: safeName,
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
      if (sanitized.dailyFocusGoalMinutes !== undefined) {
        const n = Number(sanitized.dailyFocusGoalMinutes);
        if (!Number.isFinite(n) || n < 5 || n > 720) {
          throw new Error('dailyFocusGoalMinutes must be between 5 and 720');
        }
        sanitized.dailyFocusGoalMinutes = Math.round(n);
      }
      if (sanitized.weeklyFocusGoalMinutes !== undefined) {
        const n = Number(sanitized.weeklyFocusGoalMinutes);
        if (!Number.isFinite(n) || n < 15 || n > 5000) {
          throw new Error('weeklyFocusGoalMinutes must be between 15 and 5000');
        }
        sanitized.weeklyFocusGoalMinutes = Math.round(n);
      }
      if (sanitized.monthlyBudgetPaise !== undefined) {
        const n = Number(sanitized.monthlyBudgetPaise);
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
          throw new Error('monthlyBudgetPaise must be a valid non-negative integer');
        }
        sanitized.monthlyBudgetPaise = Math.round(n);
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
      const nonCat = snap.docs.find((d) => d.id !== 'categories' && d.id !== 'savings_goals');
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
    const completed = input.completed !== undefined ? Boolean(input.completed) : false;

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
      id:
        typeof input.id === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(input.id)
          ? input.id
          : `foc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      taskId: input.taskId || null,
      taskTitle: taskTitle || null,
      subjectCode: input.subjectCode || null,
      subjectId: input.subjectId || null,
      topicId: input.topicId || null,
      activityType: input.activityType || null,
      mode,
      presetId: input.presetId || null,
      durationMinutes: safeMinutes,
      durationSeconds: safeSeconds,
      actualDurationSeconds:
        typeof input.actualDurationSeconds === 'number' && input.actualDurationSeconds >= 0
          ? Math.round(input.actualDurationSeconds)
          : (completed ? safeSeconds : 0),
      completed,
      status: input.status || (completed ? 'completed' : 'in_progress'),
      interrupted: input.interrupted !== undefined ? Boolean(input.interrupted) : false,
      pauseCount: typeof input.pauseCount === 'number' ? Math.max(0, Math.round(input.pauseCount)) : 0,
      totalPauseSeconds:
        typeof input.totalPauseSeconds === 'number' ? Math.max(0, Math.round(input.totalPauseSeconds)) : 0,
      ...(input.interruptionReason ? { interruptionReason: String(input.interruptionReason).slice(0, 256) } : {}),
      startedAt: input.startedAt || new Date().toISOString(),
      endedAt: input.endedAt !== undefined ? input.endedAt : (completed ? new Date().toISOString() : null),
      endReason: input.endReason || (completed ? 'completed' : null),
      createdAt: input.createdAt || new Date().toISOString(),
    };

    const path = `users/${userId}/focus_sessions/${session.id}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (snap.exists()) {
        const existing = snap.data() as FocusSession;
        // If document already reached terminal state ('completed' or 'interrupted'), do not revert to 'in_progress'
        if ((existing.status === 'completed' || existing.status === 'interrupted') && session.status === 'in_progress') {
          return existing;
        }
      }
    } catch {
      // Non-fatal, proceed with save
    }

    await this.saveFocusSession(userId, session);
    return session;
  },

  async updateFocusSession(
    userId: string,
    sessionId: string,
    updates: Partial<FocusSession>
  ): Promise<FocusSession> {
    const path = `users/${userId}/focus_sessions/${sessionId}`;
    let existing: Partial<FocusSession> = {};
    try {
      const snap = await getDoc(doc(db, path));
      if (snap.exists()) {
        existing = snap.data() as FocusSession;
      }
    } catch {
      // Proceed
    }

    const completed =
      updates.completed !== undefined ? Boolean(updates.completed) : (existing.completed ?? false);
    const mode = updates.mode ?? existing.mode ?? 'work';
    const taskId = updates.taskId !== undefined ? updates.taskId : (existing.taskId ?? null);

    // If session transitions to completed work session and has a linked task, increment task completedPomodoros
    if (completed && mode === 'work' && taskId && !existing.completed) {
      const taskPath = `users/${userId}/tasks/${taskId}`;
      try {
        const taskSnap = await getDoc(doc(db, taskPath));
        if (taskSnap.exists()) {
          const task = taskSnap.data() as Task;
          await setDoc(
            doc(db, taskPath),
            {
              completedPomodoros: (task.completedPomodoros || 0) + 1,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      } catch {
        // non-fatal
      }
    }

    const merged: FocusSession = {
      id: sessionId,
      userId,
      taskId,
      taskTitle: updates.taskTitle !== undefined ? updates.taskTitle : (existing.taskTitle ?? null),
      subjectCode: updates.subjectCode !== undefined ? updates.subjectCode : (existing.subjectCode ?? null),
      subjectId: updates.subjectId !== undefined ? updates.subjectId : (existing.subjectId ?? null),
      topicId: updates.topicId !== undefined ? updates.topicId : (existing.topicId ?? null),
      activityType: updates.activityType !== undefined ? updates.activityType : (existing.activityType ?? null),
      mode,
      presetId: updates.presetId !== undefined ? updates.presetId : (existing.presetId ?? null),
      durationMinutes:
        updates.durationMinutes !== undefined ? updates.durationMinutes : (existing.durationMinutes ?? 25),
      durationSeconds:
        updates.durationSeconds !== undefined ? updates.durationSeconds : (existing.durationSeconds ?? 1500),
      actualDurationSeconds:
        updates.actualDurationSeconds !== undefined
          ? updates.actualDurationSeconds
          : (existing.actualDurationSeconds ?? (completed ? (existing.durationSeconds ?? 1500) : 0)),
      completed,
      status: updates.status ?? existing.status ?? (completed ? 'completed' : 'in_progress'),
      interrupted: updates.interrupted !== undefined ? updates.interrupted : (existing.interrupted ?? false),
      pauseCount: updates.pauseCount !== undefined ? updates.pauseCount : (existing.pauseCount ?? 0),
      totalPauseSeconds:
        updates.totalPauseSeconds !== undefined ? updates.totalPauseSeconds : (existing.totalPauseSeconds ?? 0),
      interruptionReason:
        updates.interruptionReason !== undefined ? updates.interruptionReason : existing.interruptionReason,
      startedAt: updates.startedAt || existing.startedAt || new Date().toISOString(),
      endedAt: updates.endedAt !== undefined ? updates.endedAt : (existing.endedAt ?? (completed ? new Date().toISOString() : null)),
      endReason: updates.endReason !== undefined ? updates.endReason : (existing.endReason ?? (completed ? 'completed' : null)),
      createdAt: existing.createdAt || new Date().toISOString(),
    };

    await setDoc(doc(db, path), stripUndefined({ ...merged }), { merge: true });
    return merged;
  },

  async recordInterruption(
    userId: string,
    sessionId: string,
    input: Partial<PomodoroInterruption>
  ): Promise<PomodoroInterruption> {
    const eventId = input.id || `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/focus_sessions/${sessionId}/interruptions/${eventId}`;

    const event: PomodoroInterruption = {
      id: eventId,
      userId,
      sessionId,
      eventType: input.eventType === 'resume' ? 'resume' : 'pause',
      occurredAt: input.occurredAt || nowIso,
      reason: input.reason ? String(input.reason).slice(0, 512) : null,
    };

    try {
      await setDoc(doc(db, path), stripUndefined({ ...event }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return event;
  },

  async listInterruptions(userId: string, sessionId: string): Promise<PomodoroInterruption[]> {
    const path = `users/${userId}/focus_sessions/${sessionId}/interruptions`;
    const list = await listSubcollection<PomodoroInterruption>(path);
    return list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  },

  async getFocusStats(userId: string, targetTimezone: string = DEFAULT_TIMEZONE): Promise<FocusStatsData> {
    const cachedSessions = clientDataCache.getFocusSessions();
    const all = cachedSessions || (await this.getFocusSessions(userId));
    if (!cachedSessions) clientDataCache.setFocusSessions(all);
    const sessions = all.filter((s) => s.completed);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const last7Days: FocusStatsData['last7Days'] = [];

    const now = new Date();
    const todayZoned = formatDateInTimezone(now, targetTimezone);

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatDateInTimezone(d, targetTimezone);
      const daySessions = sessions.filter(
        (s) => formatDateInTimezone(s.startedAt, targetTimezone) === dateStr && s.mode === 'work'
      );
      const totalSecs = daySessions.reduce(
        (acc, s) =>
          acc +
          (typeof s.actualDurationSeconds === 'number' && !Number.isNaN(s.actualDurationSeconds)
            ? s.actualDurationSeconds
            : typeof s.durationSeconds === 'number' && !Number.isNaN(s.durationSeconds)
            ? s.durationSeconds
            : (s.durationMinutes || 0) * 60),
        0
      );
      const dayIndex = new Date(dateStr + 'T12:00:00Z').getUTCDay();
      last7Days.push({
        date: dateStr,
        dayName: dayNames[dayIndex],
        minutes: Math.round(totalSecs / 60),
        sessionsCount: daySessions.length,
      });
    }

    const currentMonthKey = todayZoned.slice(0, 7); // YYYY-MM
    const monthSessions = sessions.filter(
      (s) =>
        formatDateInTimezone(s.startedAt, targetTimezone).startsWith(currentMonthKey) &&
        s.mode === 'work'
    );
    const monthMinutes = Math.round(
      monthSessions.reduce(
        (acc, s) =>
          acc +
          (typeof s.actualDurationSeconds === 'number' && !Number.isNaN(s.actualDurationSeconds)
            ? s.actualDurationSeconds
            : typeof s.durationSeconds === 'number' && !Number.isNaN(s.durationSeconds)
            ? s.durationSeconds
            : (s.durationMinutes || 0) * 60),
        0
      ) / 60
    );
    const totalMinutes = Math.round(
      sessions
        .filter((s) => s.mode === 'work')
        .reduce(
          (acc, s) =>
            acc +
            (typeof s.actualDurationSeconds === 'number' && !Number.isNaN(s.actualDurationSeconds)
              ? s.actualDurationSeconds
              : typeof s.durationSeconds === 'number' && !Number.isNaN(s.durationSeconds)
              ? s.durationSeconds
              : (s.durationMinutes || 0) * 60),
          0
        ) / 60
    );
    const totalCompletedSessions = sessions.filter((s) => s.mode === 'work').length;
    const weeklyMinutes = last7Days.reduce((acc, d) => acc + d.minutes, 0);

    const dailyHeatmap: FocusStatsData['dailyHeatmap'] = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatDateInTimezone(d, targetTimezone);
      const dayWorkSessions = sessions.filter(
        (s) => formatDateInTimezone(s.startedAt, targetTimezone) === dateStr && s.mode === 'work'
      );
      dailyHeatmap.push({
        date: dateStr,
        minutes: Math.round(
          dayWorkSessions.reduce(
            (acc, s) =>
              acc +
              (typeof s.actualDurationSeconds === 'number' && !Number.isNaN(s.actualDurationSeconds)
                ? s.actualDurationSeconds
                : typeof s.durationSeconds === 'number' && !Number.isNaN(s.durationSeconds)
                ? s.durationSeconds
                : (s.durationMinutes || 0) * 60),
            0
          ) / 60
        ),
        sessionsCount: dayWorkSessions.length,
      });
    }

    return {
      last7Days,
      dailyHeatmap,
      weeklyMinutes,
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
    return list
      .filter((t) => !t.deletedAt)
      .sort((a, b) => {
        const orderA = Number.isFinite(a.order) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(b.order) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return b.createdAt.localeCompare(a.createdAt);
      });
  },

  async createTask(userId: string, input: Partial<Task>): Promise<Task> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) throw new Error('Title is required');
    const est = Number(input.estimatedPomodoros);
    const recurrence: TaskRecurrence =
      input.recurrence === 'daily' ||
      input.recurrence === 'weekly' ||
      input.recurrence === 'monthly'
        ? input.recurrence
        : 'none';
    const now = new Date().toISOString();
    const created: Task = {
      id:
        typeof input.id === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(input.id)
          ? input.id
          : `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      title,
      description: (input.description || '').trim(),
      priority:
        input.priority === 'low' || input.priority === 'high' ? input.priority : 'medium',
      status:
        input.status === 'in_progress' || input.status === 'completed' ? input.status : 'todo',
      category: (input.category || 'General').trim() || 'General',
      subtasks: parseSubtasks(input.subtasks),
      recurrence,
      order: Number.isFinite(Number(input.order)) ? Number(input.order) : 0,
      estimatedPomodoros: Number.isFinite(est) && est >= 1 ? Math.min(100, Math.round(est)) : 1,
      completedPomodoros: 0,
      dueDate: input.dueDate || null,
      completedAt: null,
      deletedAt: null,
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
      const prevStatus = existing.status;
      const nowIso = new Date().toISOString();
      const nextStatus = updates.status || existing.status;
      const completedAt =
        nextStatus === 'completed' && prevStatus !== 'completed'
          ? nowIso
          : nextStatus !== 'completed'
            ? null
            : existing.completedAt || null;

      const next: Task = {
        ...existing,
        ...updates,
        id,
        userId,
        title: updates.title !== undefined ? updates.title.trim() : existing.title,
        description:
          updates.description !== undefined ? updates.description.trim() : existing.description,
        category:
          updates.category !== undefined ? updates.category.trim() || 'General' : existing.category,
        subtasks:
          updates.subtasks !== undefined ? parseSubtasks(updates.subtasks) : existing.subtasks,
        completedAt,
        updatedAt: nowIso,
      };
      if (!next.title) throw new Error('Title is required');
      await setDoc(doc(db, path), stripUndefined({ ...next }), { merge: true });

      const rec = next.recurrence || 'none';
      if (prevStatus !== 'completed' && next.status === 'completed' && rec !== 'none') {
        const nextDue = computeNextRecurrenceDueDate(next.dueDate, rec);
        const clonedSubtasks = (next.subtasks || []).map((s, idx) => ({
          id: `sub_${Date.now()}_${idx}`,
          title: s.title,
          done: false,
        }));
        await this.createTask(userId, {
          title: next.title,
          description: next.description,
          priority: next.priority,
          status: 'todo',
          category: next.category || 'General',
          subtasks: clonedSubtasks,
          recurrence: rec,
          estimatedPomodoros: next.estimatedPomodoros,
          dueDate: nextDue,
        });
      }

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
    const nowIso = new Date().toISOString();
    try {
      await setDoc(doc(db, path), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
    } catch {
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  },

  listenTasks(userId: string, onUpdate: (tasks: Task[]) => void): Unsubscribe {
    const path = `users/${userId}/tasks`;
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => d.data() as Task)
          .filter((t) => !t.deletedAt);
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
    return list.filter((i) => !i.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  },

  async createIncome(userId: string, input: Partial<IncomeTransaction>): Promise<IncomeTransaction> {
    const source = typeof input.source === 'string' ? input.source.trim() : '';
    const amount = Number(input.amountPaise);
    if (!source) throw new Error('Income source is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valid amount is required');

    const created: IncomeTransaction = {
      id:
        typeof input.id === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(input.id)
          ? input.id
          : `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    const nowIso = new Date().toISOString();
    try {
      await setDoc(doc(db, path), { deletedAt: nowIso }, { merge: true });
    } catch {
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
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
    let categoryId = input.categoryId;
    if (!categoryId && (input as any).categoryName) {
      const rawName = String((input as any).categoryName).trim().toLowerCase();
      const match = cats.find((c) => c.name.toLowerCase() === rawName) ||
                    cats.find((c) => c.name.toLowerCase().includes(rawName) || rawName.includes(c.name.toLowerCase()));
      if (match) {
        categoryId = match.id;
      }
    }
    if (!categoryId) {
      categoryId = cats[0]?.id || 'cat_1';
    }
    const dueDayNum = Number(input.dueDay);
    const now = new Date().toISOString();

    const created: RecurringExpense = {
      id:
        typeof input.id === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(input.id)
          ? input.id
          : `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    const active = all.filter((e) => !e.deletedAt);
    const filtered = type ? active.filter((e) => e.type === type) : active;
    return filtered
      .map((e) => ({
        ...e,
        categoryName: cats.find((c) => c.id === e.categoryId)?.name || 'Uncategorized',
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
    let categoryId = input.categoryId;
    if (!categoryId && (input as any).categoryName) {
      const rawName = String((input as any).categoryName).trim().toLowerCase();
      const match = cats.find((c) => c.name.toLowerCase() === rawName) ||
                    cats.find((c) => c.name.toLowerCase().includes(rawName) || rawName.includes(c.name.toLowerCase()));
      if (match) {
        categoryId = match.id;
      }
    }
    if (!categoryId) {
      categoryId = cats[0]?.id || 'cat_1';
    }
    const created: ExpenseTransaction = {
      id:
        typeof input.id === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(input.id)
          ? input.id
          : `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    const nowIso = new Date().toISOString();
    try {
      await setDoc(doc(db, path), { deletedAt: nowIso }, { merge: true });
    } catch {
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  },

  // Bills & Payment History
  async checkRecurringBills(userId: string): Promise<Bill[]> {
    const [recs, bills, settings] = await Promise.all([
      listSubcollection<RecurringExpense>(`users/${userId}/recurring_expenses`),
      listSubcollection<Bill>(`users/${userId}/bills`),
      this.getSettings(userId),
    ]);

    const tz = settings?.timezone || DEFAULT_TIMEZONE;
    const todayStr = getTodayDateString(tz);
    const parsedToday = parseDateString(todayStr) || { year: 2026, month: 11, day: 12 };
    const currentYear = parsedToday.year;
    const currentMonth = parsedToday.month;
    const periodKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const writes: Promise<void>[] = [];
    for (const rec of recs) {
      if (!rec.isActive) continue;

      // Period cadence check
      if (rec.recurrence === 'quarterly') {
        const createdParsed = rec.createdAt ? parseDateString(rec.createdAt.slice(0, 10)) : null;
        const createdMonth = createdParsed ? createdParsed.month : 1;
        if (Math.abs(currentMonth - createdMonth) % 3 !== 0) continue;
      } else if (rec.recurrence === 'yearly') {
        const createdParsed = rec.createdAt ? parseDateString(rec.createdAt.slice(0, 10)) : null;
        const createdMonth = createdParsed ? createdParsed.month : 1;
        if (currentMonth !== createdMonth) continue;
      }

      const billId = `bill_${rec.id}_${periodKey}`;
      const existing = bills.find(
        (b) => b.id === billId || (b.recurringExpenseId === rec.id && b.periodKey === periodKey)
      );

      if (!existing) {
        const maxDays = getDaysInMonth(currentYear, currentMonth);
        const clampedDay = Math.min(Math.max(Math.round(rec.dueDay || 1), 1), maxDays);
        const dueDate = formatYmd(currentYear, currentMonth, clampedDay);
        const created: Bill = {
          id: billId,
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
      if (!bill.deletedAt && bill.status === 'UNPAID' && bill.dueDate < todayStr) {
        bill.status = 'OVERDUE';
        bill.updatedAt = new Date().toISOString();
        writes.push(this.saveBill(userId, bill));
      }
    }

    if (writes.length > 0) {
      await Promise.all(writes);
    }
    return bills.filter((b) => !b.deletedAt);
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

    const [cats, settings] = await Promise.all([this.getCategories(userId), this.getSettings(userId)]);
    let resolvedCat = cats.find((c) => c.id === input.categoryId);
    if (!resolvedCat && input.categoryId) {
      resolvedCat = cats.find((c) => c.name.toLowerCase() === input.categoryId!.trim().toLowerCase());
    }
    const rawCatName = (input as Record<string, unknown>).categoryName;
    if (!resolvedCat && typeof rawCatName === 'string') {
      resolvedCat = cats.find((c) => c.name.toLowerCase() === rawCatName.trim().toLowerCase());
    }
    const categoryId =
      resolvedCat?.id ||
      (input.categoryId && cats.some((c) => c.id === input.categoryId)
        ? input.categoryId
        : cats.find((c) => c.name.toLowerCase().includes('bill') || c.name.toLowerCase().includes('util'))?.id ||
          cats.find((c) => c.type === 'fixed')?.id ||
          cats[0]?.id ||
          'cat_util');
    const tz = settings?.timezone || DEFAULT_TIMEZONE;
    const todayStr = getTodayDateString(tz);
    const now = new Date().toISOString();

    const created: Bill = {
      id:
        typeof input.id === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(input.id)
          ? input.id
          : `bill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    notes?: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; bill: Bill }> {
    const billPath = `users/${userId}/bills/${billId}`;
    const [settings, cats] = await Promise.all([this.getSettings(userId), this.getCategories(userId)]);
    const tz = settings?.timezone || DEFAULT_TIMEZONE;
    const effectivePaidDate = paidDate || getTodayDateString(tz);
    const nowIso = new Date().toISOString();

    const billRef = doc(db, billPath);
    const expId = `exp_bill_${billId}`;
    const expRef = doc(db, `users/${userId}/expenses/${expId}`);

    let finalBill: Bill;
    let replayed = false;

    try {
      finalBill = await runTransaction(db, async (tx) => {
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) {
          throw new Error('Bill not found');
        }
        const bill = billSnap.data() as Bill;

        if (
          idempotencyKey &&
          bill.lastPaymentIdempotencyKey === idempotencyKey &&
          bill.status === 'PAID'
        ) {
          replayed = true;
          return bill;
        }
        if (bill.status === 'PAID') {
          throw new Error('Bill is already paid');
        }

        // Read linked expense inside transaction before writes
        const expSnap = await tx.get(expRef);

        const paymentId = `pay_${bill.id}_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;

        const updatedBill: Bill = {
          ...bill,
          status: 'PAID',
          paymentDate: effectivePaidDate,
          lastPaymentId: paymentId,
          ...(idempotencyKey ? { lastPaymentIdempotencyKey: idempotencyKey } : {}),
          updatedAt: nowIso,
        };

        const payRecord: PaymentHistory = {
          id: paymentId,
          userId,
          billId: bill.id,
          billName: bill.name,
          amountPaise: bill.amountPaise,
          paidDate: effectivePaidDate,
          paymentMethod,
          transactionRef: `REF-${bill.id}-${Date.now().toString(36).toUpperCase()}`,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          notes: notes || 'Bill payment recorded',
          status: 'completed',
          createdAt: nowIso,
        };

        const expenseTx: ExpenseTransaction = {
          id: expId,
          userId,
          billId: bill.id,
          type: 'fixed',
          categoryId: bill.categoryId,
          amountPaise: bill.amountPaise,
          date: effectivePaidDate,
          description: `${bill.name} (Bill payment)`,
          paymentMethod,
          notes: notes || 'Paid bill expense',
          deletedAt: null,
          createdAt: expSnap.exists()
            ? ((expSnap.data() as ExpenseTransaction).createdAt || nowIso)
            : nowIso,
        };

        tx.set(billRef, stripUndefined({ ...updatedBill }), { merge: true });
        tx.set(
          doc(db, `users/${userId}/payment_history/${paymentId}`),
          stripUndefined({ ...payRecord }),
          { merge: true }
        );
        tx.set(expRef, stripUndefined({ ...expenseTx }), { merge: true });

        return updatedBill;
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === 'Bill not found' || err.message === 'Bill is already paid')
      ) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, billPath);
    }

    if (!replayed) {
      await this.recordAuditLog(userId, {
        action: 'pay',
        entityType: 'bill',
        entityId: finalBill.id,
        entityTitle: finalBill.name,
        details: `Paid ${finalBill.amountPaise} paise via ${paymentMethod}`,
      });
    }

    return {
      success: true,
      bill: {
        ...finalBill,
        categoryName: cats.find((c) => c.id === finalBill.categoryId)?.name || 'Bill',
      },
    };
  },

  async undoBillPayment(userId: string, billId: string): Promise<{ success: boolean; bill: Bill }> {
    const billPath = `users/${userId}/bills/${billId}`;
    const [settings, historyItems, cats] = await Promise.all([
      this.getSettings(userId),
      this.getPaymentHistory(userId),
      this.getCategories(userId),
    ]);

    const tz = settings?.timezone || DEFAULT_TIMEZONE;
    const todayStr = getTodayDateString(tz);
    const nowIso = new Date().toISOString();
    const linkedPayments = historyItems.filter((p) => p.billId === billId && p.status !== 'reversed');
    const billRef = doc(db, billPath);
    const expRef = doc(db, `users/${userId}/expenses/exp_bill_${billId}`);

    let revertedBill: Bill;
    try {
      revertedBill = await runTransaction(db, async (tx) => {
        const snap = await tx.get(billRef);
        if (!snap.exists()) throw new Error('Bill not found');
        const bill = snap.data() as Bill;
        if (bill.status !== 'PAID') throw new Error('Bill is not marked as paid');
        const expSnap = await tx.get(expRef);

        const nextBill: Bill = {
          ...bill,
          status: bill.dueDate < todayStr ? 'OVERDUE' : 'UNPAID',
          paymentDate: null,
          lastPaymentId: null,
          lastPaymentIdempotencyKey: null,
          updatedAt: nowIso,
        };

        tx.set(billRef, stripUndefined({ ...nextBill }), { merge: true });
        if (expSnap.exists()) {
          tx.set(expRef, { deletedAt: nowIso }, { merge: true });
        }
        for (const p of linkedPayments) {
          tx.set(
            doc(db, `users/${userId}/payment_history/${p.id}`),
            { status: 'reversed', reversedAt: nowIso },
            { merge: true }
          );
        }
        return nextBill;
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === 'Bill not found' || err.message === 'Bill is not marked as paid')
      ) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, billPath);
    }

    await this.recordAuditLog(userId, {
      action: 'undo_payment',
      entityType: 'bill',
      entityId: revertedBill.id,
      entityTitle: revertedBill.name,
      details: `Reversed payment for bill "${revertedBill.name}"`,
    });

    return {
      success: true,
      bill: {
        ...revertedBill,
        categoryName: cats.find((c) => c.id === revertedBill.categoryId)?.name || 'Bill',
      },
    };
  },

  async deleteBill(userId: string, billId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const billPath = `users/${userId}/bills/${billId}`;
    try {
      const expSnap = await getDoc(doc(db, `users/${userId}/expenses/exp_bill_${billId}`)).catch(() => null);
      await Promise.all([
        setDoc(doc(db, billPath), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true }),
        expSnap && expSnap.exists()
          ? setDoc(doc(db, `users/${userId}/expenses/exp_bill_${billId}`), { deletedAt: nowIso }, { merge: true })
          : Promise.resolve(),
      ]);
    } catch {
      try {
        await deleteDoc(doc(db, billPath));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, billPath);
      }
    }
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
    const cachedSessions = clientDataCache.getFocusSessions();
    const cachedTasks = clientDataCache.getTasks();
    const cachedIncomes = clientDataCache.getIncomes();
    const cachedExpenses = clientDataCache.getExpenses();
    const cachedBills = clientDataCache.getBills();
    const cachedCats = clientDataCache.getCategories();

    const [sessions, tasks, incomes, expenses, bills, cats, userSettings]: [
      FocusSession[],
      Task[],
      IncomeTransaction[],
      ExpenseTransaction[],
      Bill[],
      ExpenseCategory[],
      Partial<UserSettings> | null,
    ] = await Promise.all([
      cachedSessions ? Promise.resolve(cachedSessions) : this.getFocusSessions(userId),
      cachedTasks ? Promise.resolve(cachedTasks) : this.getTasks(userId),
      cachedIncomes ? Promise.resolve(cachedIncomes) : this.getIncomes(userId),
      cachedExpenses ? Promise.resolve(cachedExpenses) : this.getExpenses(userId),
      cachedBills ? Promise.resolve(cachedBills) : this.getBills(userId),
      cachedCats ? Promise.resolve(cachedCats) : this.getCategories(userId),
      this.getSettings(userId).catch(() => null),
    ]);

    if (!cachedSessions) clientDataCache.setFocusSessions(sessions);
    if (!cachedTasks) clientDataCache.setTasks(tasks);
    if (!cachedIncomes) clientDataCache.setIncomes(incomes);
    if (!cachedExpenses) clientDataCache.setExpenses(expenses);
    if (!cachedBills) clientDataCache.setBills(bills);
    if (!cachedCats) clientDataCache.setCategories(cats);

    const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
    const todayStr = getTodayDateString(tz);
    const currentMonthKey = todayStr.substring(0, 7);
    const weekStartStr = getStartOfWeek(todayStr);

    const todaySessions = sessions.filter((s) => formatDateInTimezone(s.startedAt, tz) === todayStr && s.completed);
    const todayFocusSeconds = todaySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    const weeklyFocusSeconds = sessions
      .filter((s) => s.mode === 'work' && s.completed && formatDateInTimezone(s.startedAt, tz) >= weekStartStr)
      .reduce((acc, s) => acc + s.durationSeconds, 0);
    const completedPomodoroSessions = todaySessions.filter((s) => s.mode === 'work').length;
    const focusStreakDays = calculateBoundedStreakDays(sessions, new Date());
    const bestStreakDays = computeBestStreakDays(sessions);

    const completedTasksCount = tasks.filter((t) => t.status === 'completed').length;
    const pendingTasksCount = tasks.filter((t) => t.status !== 'completed').length;

    const todayIncomePaise = incomes
      .filter((inc) => inc.date === todayStr)
      .reduce((acc, inc) => acc + inc.amountPaise, 0);
    const todayExpensesPaise = expenses
      .filter((exp) => exp.date === todayStr)
      .reduce((acc, exp) => acc + exp.amountPaise, 0);

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
      weeklyFocusMinutes: Math.round(weeklyFocusSeconds / 60),
      completedPomodoroSessions,
      focusStreakDays,
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
    };
  },

  async getFinanceSummary(
    userId: string,
    filter = 'this_month',
    customStart?: string,
    customEnd?: string
  ): Promise<FinanceSummaryData> {
    const cachedIncomes = clientDataCache.getIncomes();
    const cachedExpenses = clientDataCache.getExpenses();
    const cachedBills = clientDataCache.getBills();
    const cachedCats = clientDataCache.getCategories();

    const [allIncomes, allExpenses, allBills, cats, userSettings] = await Promise.all([
      cachedIncomes ? Promise.resolve(cachedIncomes) : this.getIncomes(userId),
      cachedExpenses ? Promise.resolve(cachedExpenses) : this.getExpenses(userId),
      cachedBills ? Promise.resolve(cachedBills) : this.getBills(userId),
      cachedCats ? Promise.resolve(cachedCats) : this.getCategories(userId),
      this.getSettings(userId).catch(() => null),
    ]);

    if (!cachedIncomes) clientDataCache.setIncomes(allIncomes);
    if (!cachedExpenses) clientDataCache.setExpenses(allExpenses);
    if (!cachedBills) clientDataCache.setBills(allBills);
    if (!cachedCats) clientDataCache.setCategories(cats);

    const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
    const todayStr = getTodayDateString(tz);
    const [currentY, currentM] = todayStr.split('-').map(Number);

    let startDateStr = '';
    let endDateStr = '';

    if (filter === 'today') {
      startDateStr = todayStr;
      endDateStr = todayStr;
    } else if (filter === 'this_week') {
      const now = new Date(`${todayStr}T12:00:00.000Z`);
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - diffToMonday);
      startDateStr = startOfWeek.toISOString().split('T')[0];
      endDateStr = todayStr;
    } else if (filter === 'last_month') {
      let lmYear = currentY;
      let lmMonth = currentM - 1;
      if (lmMonth === 0) {
        lmMonth = 12;
        lmYear -= 1;
      }
      const lastDay = new Date(lmYear, lmMonth, 0).getDate();
      startDateStr = `${lmYear}-${String(lmMonth).padStart(2, '0')}-01`;
      endDateStr = `${lmYear}-${String(lmMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (filter === 'custom' && customStart && customEnd) {
      startDateStr = customStart;
      endDateStr = customEnd;
    } else {
      const lastDay = new Date(currentY, currentM, 0).getDate();
      startDateStr = `${currentY}-${String(currentM).padStart(2, '0')}-01`;
      endDateStr = `${currentY}-${String(currentM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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

    const categoryMap: Record<
      string,
      { categoryId: string; name: string; color: string; amountPaise: number }
    > = {};
    for (const exp of expenses) {
      const cat = cats.find((c) => c.id === exp.categoryId);
      const key = exp.categoryId || 'other';
      if (!categoryMap[key]) {
        categoryMap[key] = {
          categoryId: key,
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
      let y = currentY;
      let mo = currentM - m;
      while (mo <= 0) {
        mo += 12;
        y -= 1;
      }
      const key = `${y}-${String(mo).padStart(2, '0')}`;
      const label = `${monthNames[mo - 1]} ${String(y).slice(-2)}`;
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

  // Savings Goals (stored under users/{uid}/settings/savings_goals, covered by firestore.rules)
  async getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
    const path = `users/${userId}/settings/savings_goals`;
    try {
      const snap = await getDoc(doc(db, path));
      if (snap.exists()) {
        const items = (snap.data() as { items?: SavingsGoal[] }).items;
        if (Array.isArray(items)) return items;
      }
      return [];
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  },

  async saveSavingsGoalsList(userId: string, items: SavingsGoal[]): Promise<void> {
    const path = `users/${userId}/settings/savings_goals`;
    try {
      await setDoc(doc(db, path), { items }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async createSavingsGoal(userId: string, input: Partial<SavingsGoal>): Promise<SavingsGoal> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const target = Number(input.targetPaise);
    const saved = input.savedPaise !== undefined ? Number(input.savedPaise) : 0;
    if (!title) throw new Error('Goal title is required');
    if (!Number.isFinite(target) || target <= 0) throw new Error('Target amount must be positive');
    const items = await this.getSavingsGoals(userId);
    const now = new Date().toISOString();
    const created: SavingsGoal = {
      id: `svg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      title,
      targetPaise: Math.round(target),
      savedPaise: Number.isFinite(saved) && saved >= 0 ? Math.round(saved) : 0,
      targetDate: input.targetDate && isIsoDate(input.targetDate) ? input.targetDate : null,
      color: typeof input.color === 'string' && input.color.trim() ? input.color.trim() : '#10b981',
      createdAt: now,
      updatedAt: now,
    };
    await this.saveSavingsGoalsList(userId, [created, ...items]);
    return created;
  },

  async updateSavingsGoal(
    userId: string,
    id: string,
    updates: Partial<SavingsGoal>
  ): Promise<SavingsGoal> {
    const items = await this.getSavingsGoals(userId);
    const idx = items.findIndex((g) => g.id === id);
    if (idx === -1) throw new Error('Savings goal not found');
    const cur = items[idx];
    const next: SavingsGoal = {
      ...cur,
      title: updates.title !== undefined ? updates.title.trim() || cur.title : cur.title,
      targetPaise:
        updates.targetPaise !== undefined && Number.isFinite(Number(updates.targetPaise)) && Number(updates.targetPaise) > 0
          ? Math.round(Number(updates.targetPaise))
          : cur.targetPaise,
      savedPaise:
        updates.savedPaise !== undefined && Number.isFinite(Number(updates.savedPaise)) && Number(updates.savedPaise) >= 0
          ? Math.round(Number(updates.savedPaise))
          : cur.savedPaise,
      targetDate: updates.targetDate !== undefined ? updates.targetDate : cur.targetDate,
      color: updates.color !== undefined ? updates.color : cur.color,
      updatedAt: new Date().toISOString(),
    };
    items[idx] = next;
    await this.saveSavingsGoalsList(userId, items);
    return next;
  },

  async contributeSavingsGoal(
    userId: string,
    id: string,
    deltaPaise: number
  ): Promise<SavingsGoal> {
    if (!Number.isFinite(deltaPaise) || deltaPaise === 0) {
      throw new Error('Non-zero contribution amount is required');
    }
    const items = await this.getSavingsGoals(userId);
    const idx = items.findIndex((g) => g.id === id);
    if (idx === -1) throw new Error('Savings goal not found');
    const cur = items[idx];
    const nextSaved = cur.savedPaise + Math.round(deltaPaise);
    if (nextSaved < 0) throw new Error('Cannot withdraw more than current saved amount');
    items[idx] = { ...cur, savedPaise: nextSaved, updatedAt: new Date().toISOString() };
    await this.saveSavingsGoalsList(userId, items);
    return items[idx];
  },

  async deleteSavingsGoal(userId: string, id: string): Promise<void> {
    const items = await this.getSavingsGoals(userId);
    await this.saveSavingsGoalsList(
      userId,
      items.filter((g) => g.id !== id)
    );
  },

  // Trash & Restore
  async getTrashItems(userId: string): Promise<TrashRecord[]> {
    const [tasks, incomes, expenses, bills, timeBlocks, envelopes, subscriptions, habits] = await Promise.all([
      listSubcollection<Task>(`users/${userId}/tasks`),
      listSubcollection<IncomeTransaction>(`users/${userId}/income`),
      listSubcollection<ExpenseTransaction>(`users/${userId}/expenses`),
      listSubcollection<Bill>(`users/${userId}/bills`),
      listSubcollection<TimeBlock>(`users/${userId}/time_blocks`),
      listSubcollection<BudgetEnvelope>(`users/${userId}/envelopes`),
      listSubcollection<SubscriptionPlan>(`users/${userId}/subscriptions`),
      listSubcollection<Habit>(`users/${userId}/habits`),
    ]);

    const records: TrashRecord[] = [
      ...tasks
        .filter((t) => Boolean(t.deletedAt))
        .map((t) => ({
          id: t.id,
          entityType: 'task' as const,
          title: t.title,
          subtitle: `Task • ${t.priority}`,
          deletedAt: t.deletedAt!,
        })),
      ...incomes
        .filter((i) => Boolean(i.deletedAt))
        .map((i) => ({
          id: i.id,
          entityType: 'income' as const,
          title: i.source,
          subtitle: `Income • ${i.date}`,
          amountPaise: i.amountPaise,
          deletedAt: i.deletedAt!,
        })),
      ...expenses
        .filter((e) => Boolean(e.deletedAt))
        .map((e) => ({
          id: e.id,
          entityType: 'expense' as const,
          title: e.description,
          subtitle: `Expense • ${e.date}`,
          amountPaise: e.amountPaise,
          deletedAt: e.deletedAt!,
        })),
      ...bills
        .filter((b) => Boolean(b.deletedAt))
        .map((b) => ({
          id: b.id,
          entityType: 'bill' as const,
          title: b.name,
          subtitle: `Bill • Due ${b.dueDate}`,
          amountPaise: b.amountPaise,
          deletedAt: b.deletedAt!,
        })),
      ...timeBlocks
        .filter((tb) => Boolean(tb.deletedAt))
        .map((tb) => ({
          id: tb.id,
          entityType: 'time_block' as const,
          title: tb.title,
          subtitle: `Time Block • ${tb.date}`,
          deletedAt: tb.deletedAt!,
        })),
      ...envelopes
        .filter((env) => Boolean(env.deletedAt))
        .map((env) => ({
          id: env.id,
          entityType: 'envelope' as const,
          title: env.name,
          subtitle: `Envelope • ${env.monthKey}`,
          amountPaise: env.allocatedPaise,
          deletedAt: env.deletedAt!,
        })),
      ...subscriptions
        .filter((s) => Boolean(s.deletedAt))
        .map((s) => ({
          id: s.id,
          entityType: 'subscription' as const,
          title: s.name,
          subtitle: `Subscription • ${s.billingCycle}`,
          amountPaise: s.amountPaise,
          deletedAt: s.deletedAt!,
        })),
      ...habits
        .filter((h) => Boolean(h.deletedAt))
        .map((h) => ({
          id: h.id,
          entityType: 'habit' as const,
          title: h.title,
          subtitle: `Habit • ${h.frequency}`,
          deletedAt: h.deletedAt!,
        })),
    ];

    return records.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  },

  async restoreTrashItem(userId: string, entityType: TrashRecord['entityType'], id: string): Promise<void> {
    const colMap: Record<TrashRecord['entityType'], string> = {
      task: 'tasks',
      income: 'income',
      expense: 'expenses',
      bill: 'bills',
      time_block: 'time_blocks',
      envelope: 'envelopes',
      subscription: 'subscriptions',
      habit: 'habits',
    };
    const path = `users/${userId}/${colMap[entityType]}/${id}`;
    await setDoc(doc(db, path), { deletedAt: null }, { merge: true });
    if (entityType === 'bill') {
      const expSnap = await getDoc(doc(db, `users/${userId}/expenses/exp_bill_${id}`)).catch(() => null);
      if (expSnap && expSnap.exists()) {
        await setDoc(doc(db, `users/${userId}/expenses/exp_bill_${id}`), { deletedAt: null }, { merge: true });
      }
    }
  },

  async permanentlyDeleteTrashItem(
    userId: string,
    entityType: TrashRecord['entityType'],
    id: string
  ): Promise<void> {
    const colMap: Record<TrashRecord['entityType'], string> = {
      task: 'tasks',
      income: 'income',
      expense: 'expenses',
      bill: 'bills',
      time_block: 'time_blocks',
      envelope: 'envelopes',
      subscription: 'subscriptions',
      habit: 'habits',
    };
    const path = `users/${userId}/${colMap[entityType]}/${id}`;
    try {
      await deleteDoc(doc(db, path));
      if (entityType === 'bill') {
        await deleteDoc(doc(db, `users/${userId}/expenses/exp_bill_${id}`)).catch(() => {});
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // --- TIME BLOCKS ---
  async getTimeBlocks(userId: string, date?: string): Promise<TimeBlock[]> {
    const blocks = await listSubcollection<TimeBlock>(`users/${userId}/time_blocks`);
    return blocks
      .filter((tb) => !tb.deletedAt && (!date || tb.date === date))
      .sort((a, b) => a.startMinute - b.startMinute);
  },

  async saveTimeBlock(userId: string, input: Partial<TimeBlock>): Promise<TimeBlock> {
    const id = input.id || `tb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/time_blocks/${id}`;
    let existing: Partial<TimeBlock> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          existing = snap.data() as TimeBlock;
        }
      } catch {
        // Proceed with defaults if doc does not exist yet
      }
    }
    const rawStart = input.startMinute !== undefined ? Number(input.startMinute) : Number(existing.startMinute ?? 0);
    const startMinute = Math.max(0, Math.min(1439, Number.isFinite(rawStart) ? Math.round(rawStart) : 0));
    const rawEnd = input.endMinute !== undefined ? Number(input.endMinute) : Number(existing.endMinute ?? 60);
    const endMinute = Math.max(startMinute + 1, Math.min(1440, Number.isFinite(rawEnd) ? Math.round(rawEnd) : startMinute + 60));

    const block: TimeBlock = {
      id,
      userId,
      date: input.date ?? existing.date ?? getTodayDateString(DEFAULT_TIMEZONE),
      title: (input.title ?? existing.title ?? 'Focus Block').trim() || 'Focus Block',
      startMinute,
      endMinute,
      category: input.category ?? existing.category ?? 'Focus',
      taskId: input.taskId !== undefined ? input.taskId : (existing.taskId ?? null),
      revisionId: input.revisionId !== undefined ? input.revisionId : (existing.revisionId ?? null),
      completed: input.completed !== undefined ? Boolean(input.completed) : Boolean(existing.completed),
      notes: input.notes !== undefined ? input.notes : (existing.notes ?? ''),
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...block }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return block;
  },

  async deleteTimeBlock(userId: string, id: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/time_blocks/${id}`;
    try {
      await setDoc(doc(db, path), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
    } catch {
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  },

  // --- HABITS ---
  async getHabits(userId: string): Promise<Habit[]> {
    const list = await listSubcollection<Habit>(`users/${userId}/habits`);
    return list
      .filter((h) => !h.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveHabit(userId: string, input: Partial<Habit>): Promise<Habit> {
    const id = input.id || `habit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/habits/${id}`;
    let existing: Partial<Habit> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          existing = snap.data() as Habit;
        }
      } catch {
        // Proceed with defaults if doc does not exist yet
      }
    }
    const habit: Habit = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Daily Habit').trim() || 'Daily Habit',
      description: input.description !== undefined ? input.description : (existing.description ?? ''),
      category: input.category ?? existing.category ?? 'General',
      color: input.color ?? existing.color ?? '#10b981',
      frequency: input.frequency ?? existing.frequency ?? 'daily',
      targetDaysPerWeek: Math.max(
        1,
        Math.min(7, Number(input.targetDaysPerWeek ?? existing.targetDaysPerWeek ?? 7) || 7)
      ),
      customDays: input.customDays ?? existing.customDays ?? [0, 1, 2, 3, 4, 5, 6],
      completedDates: Array.isArray(input.completedDates)
        ? input.completedDates
        : (existing.completedDates ?? []),
      bestStreakDays: Number(input.bestStreakDays ?? existing.bestStreakDays ?? 0) || 0,
      reminderTime: input.reminderTime !== undefined ? input.reminderTime : (existing.reminderTime ?? ''),
      archived: input.archived !== undefined ? Boolean(input.archived) : Boolean(existing.archived),
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...habit }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return habit;
  },

  async toggleHabitCompletion(userId: string, habitId: string, dateStr: string): Promise<Habit | null> {
    const habits = await this.getHabits(userId);
    const target = habits.find((h) => h.id === habitId);
    if (!target) return null;
    const completedSet = new Set(target.completedDates || []);
    if (completedSet.has(dateStr)) {
      completedSet.delete(dateStr);
    } else {
      completedSet.add(dateStr);
    }
    const updatedDates = Array.from(completedSet).sort();
    const nowIso = new Date().toISOString();
    const bestStreak = Math.max(target.bestStreakDays || 0, updatedDates.length);
    const updated: Habit = {
      ...target,
      completedDates: updatedDates,
      bestStreakDays: bestStreak,
      updatedAt: nowIso,
    };
    await this.saveHabit(userId, updated);
    return updated;
  },

  async deleteHabit(userId: string, habitId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/habits/${habitId}`;
    try {
      await setDoc(doc(db, path), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
    } catch {
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  },

  // --- BUDGET ENVELOPES ---
  async getEnvelopes(userId: string, monthKey?: string): Promise<BudgetEnvelope[]> {
    const envelopes = await listSubcollection<BudgetEnvelope>(`users/${userId}/envelopes`);
    const currentMonthKey = monthKey || getTodayDateString(DEFAULT_TIMEZONE).slice(0, 7);
    const active = envelopes.filter((env) => !env.deletedAt && (!monthKey || env.monthKey === currentMonthKey));
    
    // Calculate spent paise from expenses in matching category and month
    const expenses = await listSubcollection<ExpenseTransaction>(`users/${userId}/expenses`);
    return active.map((env) => {
      let spent = 0;
      if (env.categoryId) {
        spent = expenses
          .filter((e) => !e.deletedAt && e.categoryId === env.categoryId && e.date.startsWith(env.monthKey))
          .reduce((sum, e) => sum + (e.amountPaise || 0), 0);
      }
      return {
        ...env,
        spentPaise: spent,
      };
    });
  },

  async saveEnvelope(userId: string, input: Partial<BudgetEnvelope>): Promise<BudgetEnvelope> {
    const id = input.id || `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const env: BudgetEnvelope = {
      id,
      userId,
      name: (input.name || 'Envelope').trim(),
      categoryId: input.categoryId || null,
      allocatedPaise: Math.max(0, Math.floor(Number(input.allocatedPaise) || 0)),
      monthKey: input.monthKey || getTodayDateString(DEFAULT_TIMEZONE).slice(0, 7),
      color: input.color || '#6366f1',
      notes: input.notes || '',
      deletedAt: input.deletedAt || null,
      createdAt: input.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await setDoc(doc(db, `users/${userId}/envelopes/${id}`), stripUndefined({ ...env }), { merge: true });
    return env;
  },

  async transferEnvelopeFunds(
    userId: string,
    fromId: string,
    toId: string,
    amountPaise: number
  ): Promise<{ success: boolean; error?: string }> {
    if (fromId === toId) return { success: false, error: 'Cannot transfer funds to the same envelope' };
    if (amountPaise <= 0) return { success: false, error: 'Amount must be positive' };
    const fromSnap = await getDoc(doc(db, `users/${userId}/envelopes/${fromId}`));
    const toSnap = await getDoc(doc(db, `users/${userId}/envelopes/${toId}`));
    if (!fromSnap.exists() || !toSnap.exists()) return { success: false, error: 'Envelope not found' };

    const fromEnv = fromSnap.data() as BudgetEnvelope;
    const toEnv = toSnap.data() as BudgetEnvelope;
    if (fromEnv.allocatedPaise < amountPaise) return { success: false, error: 'Insufficient funds in source envelope' };

    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(doc(db, `users/${userId}/envelopes/${fromId}`), {
      allocatedPaise: fromEnv.allocatedPaise - amountPaise,
      updatedAt: nowIso,
    });
    batch.update(doc(db, `users/${userId}/envelopes/${toId}`), {
      allocatedPaise: toEnv.allocatedPaise + amountPaise,
      updatedAt: nowIso,
    });
    await batch.commit();

    await this.recordAuditLog(userId, {
      action: 'envelope_transfer',
      entityType: 'envelope',
      entityId: fromId,
      entityTitle: `${fromEnv.name} -> ${toEnv.name}`,
      details: `Transferred ${amountPaise} paise from ${fromEnv.name} to ${toEnv.name}`,
    });

    return { success: true };
  },

  async deleteEnvelope(userId: string, id: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/envelopes/${id}`;
    try {
      await setDoc(doc(db, path), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
    } catch {
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  },

  // --- SUBSCRIPTIONS ---
  async getSubscriptions(userId: string): Promise<SubscriptionPlan[]> {
    const subs = await listSubcollection<SubscriptionPlan>(`users/${userId}/subscriptions`);
    return subs.filter((s) => !s.deletedAt).sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate));
  },

  async saveSubscription(userId: string, input: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const id = input.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const sub: SubscriptionPlan = {
      id,
      userId,
      name: (input.name || 'Subscription').trim(),
      amountPaise: Math.max(0, Math.floor(Number(input.amountPaise) || 0)),
      categoryId: input.categoryId || 'cat_subscriptions',
      billingCycle: input.billingCycle || 'monthly',
      nextRenewalDate: input.nextRenewalDate || getTodayDateString(DEFAULT_TIMEZONE),
      reminderDays: Math.max(0, Number(input.reminderDays) || 3),
      autoRenew: input.autoRenew !== false,
      status: input.status || 'active',
      websiteUrl: input.websiteUrl || '',
      notes: input.notes || '',
      deletedAt: input.deletedAt || null,
      createdAt: input.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await setDoc(doc(db, `users/${userId}/subscriptions/${id}`), stripUndefined({ ...sub }), { merge: true });
    return sub;
  },

  async deleteSubscription(userId: string, id: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/subscriptions/${id}`;
    try {
      await setDoc(doc(db, path), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
    } catch {
      try {
        await deleteDoc(doc(db, path));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  },

  // --- CURSOR PAGINATED QUERIES ---
  async getExpensesPage(
    userId: string,
    pageSize = 25,
    cursorDate?: string | null,
    type?: 'fixed' | 'variable'
  ): Promise<CursorPage<ExpenseTransaction>> {
    const path = `users/${userId}/expenses`;
    try {
      const [cats, snap] = await Promise.all([
        this.getCategories(userId),
        getDocs(
          cursorDate
            ? query(
                collection(db, path),
                orderBy('date', 'desc'),
                startAfter(cursorDate),
                limit(pageSize + 15)
              )
            : query(collection(db, path), orderBy('date', 'desc'), limit(pageSize + 15))
        ),
      ]);
      const docs = snap.docs;
      const activeFiltered = docs
        .map((d) => d.data() as ExpenseTransaction)
        .filter((e) => !e.deletedAt && (!type || e.type === type));
      const hasMore = activeFiltered.length > pageSize || docs.length >= pageSize + 15;
      const items = activeFiltered.slice(0, pageSize).map((e) => ({
        ...e,
        categoryName: cats.find((c) => c.id === e.categoryId)?.name || 'Uncategorized',
        categoryColor: cats.find((c) => c.id === e.categoryId)?.color || '#6366f1',
      }));

      const lastDoc = items.length > 0 ? items[items.length - 1] : null;
      return {
        items,
        nextCursor: hasMore && lastDoc ? lastDoc.date : null,
        hasMore,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async getIncomesPage(
    userId: string,
    pageSize = 25,
    cursorDate?: string | null
  ): Promise<CursorPage<IncomeTransaction>> {
    const path = `users/${userId}/income`;
    try {
      const snap = await getDocs(
        cursorDate
          ? query(
              collection(db, path),
              orderBy('date', 'desc'),
              startAfter(cursorDate),
              limit(pageSize + 15)
            )
          : query(collection(db, path), orderBy('date', 'desc'), limit(pageSize + 15))
      );
      const docs = snap.docs;
      const activeFiltered = docs
        .map((d) => d.data() as IncomeTransaction)
        .filter((i) => !i.deletedAt);
      const hasMore = activeFiltered.length > pageSize || docs.length >= pageSize + 15;
      const items = activeFiltered.slice(0, pageSize);
      const lastDoc = items.length > 0 ? items[items.length - 1] : null;
      return {
        items,
        nextCursor: hasMore && lastDoc ? lastDoc.date : null,
        hasMore,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async getAuditLogsPage(
    userId: string,
    pageSize = 25,
    cursorTimestamp?: string | null
  ): Promise<CursorPage<AuditLogEntry>> {
    const path = `users/${userId}/audit_logs`;
    try {
      const snap = await getDocs(
        cursorTimestamp
          ? query(
              collection(db, path),
              orderBy('timestamp', 'desc'),
              startAfter(cursorTimestamp),
              limit(pageSize + 1)
            )
          : query(collection(db, path), orderBy('timestamp', 'desc'), limit(pageSize + 1))
      );
      const docs = snap.docs.map((d) => d.data() as AuditLogEntry);
      const hasMore = docs.length > pageSize;
      const items = docs.slice(0, pageSize);
      return {
        items,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].timestamp : null,
        hasMore,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async getTasksPage(
    userId: string,
    pageSize = 50,
    cursorCreatedAt?: string | null
  ): Promise<CursorPage<Task>> {
    const path = `users/${userId}/tasks`;
    try {
      const snap = await getDocs(
        cursorCreatedAt
          ? query(
              collection(db, path),
              orderBy('createdAt', 'desc'),
              startAfter(cursorCreatedAt),
              limit(pageSize + 15)
            )
          : query(collection(db, path), orderBy('createdAt', 'desc'), limit(pageSize + 15))
      );
      const docs = snap.docs.map((d) => d.data() as Task);
      const active = docs.filter((t) => !t.deletedAt).slice(0, pageSize);
      const hasMore = docs.length >= pageSize + 15;
      return {
        items: active,
        nextCursor: hasMore && active.length > 0 ? active[active.length - 1].createdAt : null,
        hasMore,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  async getFocusSessionsPage(
    userId: string,
    pageSize = 50,
    cursorStartedAt?: string | null
  ): Promise<CursorPage<FocusSession>> {
    const path = `users/${userId}/focus_sessions`;
    try {
      const snap = await getDocs(
        cursorStartedAt
          ? query(
              collection(db, path),
              orderBy('startedAt', 'desc'),
              startAfter(cursorStartedAt),
              limit(pageSize + 1)
            )
          : query(collection(db, path), orderBy('startedAt', 'desc'), limit(pageSize + 1))
      );
      const docs = snap.docs.map((d) => d.data() as FocusSession);
      const hasMore = docs.length > pageSize;
      const items = docs.slice(0, pageSize);
      return {
        items,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].startedAt : null,
        hasMore,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  },

  // --- AUDIT LOGS ---
  async getAuditLogs(userId: string, limitCount = 100): Promise<AuditLogEntry[]> {
    const page = await this.getAuditLogsPage(userId, limitCount, null);
    return page.items;
  },

  async recordAuditLog(
    userId: string,
    entry: Omit<AuditLogEntry, 'id' | 'userId' | 'timestamp'> & { timestamp?: string }
  ): Promise<AuditLogEntry> {
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const log: AuditLogEntry = {
      id,
      userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityTitle: entry.entityTitle || '',
      details: entry.details || '',
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    await setDoc(doc(db, `users/${userId}/audit_logs/${id}`), stripUndefined({ ...log }), { merge: true }).catch(() => {});
    return log;
  },

  // --- DURABLE SYNC QUEUE ---
  async getDurableSyncQueue(userId: string): Promise<DurableSyncOperation[]> {
    const ops = await listSubcollection<DurableSyncOperation>(`users/${userId}/sync_queue`);
    return ops.filter((op) => op.status !== 'completed');
  },

  async enqueueDurableSync(
    userId: string,
    op: Omit<DurableSyncOperation, 'id' | 'userId' | 'status' | 'attempts' | 'createdAt'>
  ): Promise<DurableSyncOperation> {
    const dedupeKey = typeof op.dedupeKey === 'string' && op.dedupeKey.trim() ? op.dedupeKey.trim() : undefined;
    const safeDedupeSuffix = dedupeKey
      ? dedupeKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 110)
      : '';
    const id = safeDedupeSuffix
      ? `sq_${safeDedupeSuffix}`
      : `sync_op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const item: DurableSyncOperation = {
      id,
      userId,
      entityType: op.entityType,
      action: op.action,
      sheetName: op.sheetName,
      payload: op.payload,
      ...(dedupeKey ? { dedupeKey } : {}),
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      nextRetryAt: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, `users/${userId}/sync_queue/${id}`), stripUndefined({ ...item }), { merge: true });
    return item;
  },

  async updateDurableSyncOp(
    userId: string,
    id: string,
    updates: Partial<DurableSyncOperation>
  ): Promise<void> {
    await setDoc(doc(db, `users/${userId}/sync_queue/${id}`), stripUndefined({ ...updates }), { merge: true });
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
      'time_blocks',
      'envelopes',
      'subscriptions',
      'audit_logs',
      'sync_queue',
      'study_subjects',
      'study_topics',
      'study_revisions',
      'study_mistakes',
    ];
    for (const sub of subcollections) {
      const snap = await getDocs(collection(db, `users/${userId}/${sub}`));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
    await setDoc(doc(db, `users/${userId}/settings/savings_goals`), { items: [] }, { merge: true });
    await setDoc(doc(db, `users/${userId}/settings/study_meta`), { initialized: true, clearedAt: new Date().toISOString() }, { merge: true });
    await this.getCategories(userId);
  },

  async clearStudyData(userId: string): Promise<void> {
    const subcollections = ['study_subjects', 'study_topics', 'study_revisions', 'study_mistakes'];
    for (const sub of subcollections) {
      try {
        const snap = await getDocs(collection(db, `users/${userId}/${sub}`));
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      } catch {
        // proceed gracefully
      }
    }
    await setDoc(
      doc(db, `users/${userId}/settings/study_meta`),
      { initialized: true, clearedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY MANAGEMENT (NEXTSTUDY INTEGRATION) ---
  async getStudyTiers(userId: string): Promise<AcademicTier[]> {
    const list = await listSubcollection<AcademicTier>(`users/${userId}/study_tiers`);
    return list.filter((t) => !t.deletedAt);
  },

  async saveStudyTier(userId: string, input: Partial<AcademicTier>): Promise<AcademicTier> {
    const id = input.id || `tier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_tiers/${id}`;
    let existing: Partial<AcademicTier> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          existing = snap.data() as AcademicTier;
        }
      } catch {
        // proceed
      }
    }
    const item: AcademicTier = {
      id,
      userId,
      name: (input.name ?? existing.name ?? 'Academic Tier').trim(),
      shortTitle: (input.shortTitle ?? existing.shortTitle ?? input.name ?? 'Tier').trim(),
      description: (input.description ?? existing.description ?? '').trim(),
      subjectCodes: input.subjectCodes ?? existing.subjectCodes ?? [],
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyTier(userId: string, id: string): Promise<void> {
    const directDocRef = doc(db, `users/${userId}/study_tiers/${id}`);
    await setDoc(
      directDocRef,
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  async getStudySubjects(userId: string): Promise<StudySubject[]> {
    const list = await listSubcollection<StudySubject>(`users/${userId}/study_subjects`);
    const active = list.filter((s) => !s.deletedAt);

    // FIX 3: If any records exist in the subcollection (active or soft-deleted),
    // the workspace has already been initialized. Do not resurrect intentionally deleted subjects.
    if (list.length > 0) {
      return active.sort((a, b) => a.code.localeCompare(b.code));
    }

    // Check if the user has an existing study_meta initialization marker in settings
    let isInitialized = false;
    try {
      const metaSnap = await getDoc(doc(db, `users/${userId}/settings/study_meta`));
      isInitialized = metaSnap.exists() && Boolean(metaSnap.data()?.initialized);
    } catch {
      // Proceed gracefully if settings doc read fails
    }

    // If previously initialized (e.g. all subjects were deleted or cleared), preserve empty state
    if (isInitialized) {
      return [];
    }

    // Genuinely new user with uninitialized workspace:
    // FIX 4: Atomically initialize default subjects, topics, revisions, and mistakes via writeBatch
    try {
      const batch = writeBatch(db);
      const { buildDefaultStudyWorkspace } = await import('../data/studySeedData.ts');
      const { subjects, topics, revisions, mistakes } = buildDefaultStudyWorkspace(userId);

      for (const s of subjects) {
        batch.set(doc(db, `users/${userId}/study_subjects/${s.id}`), stripUndefined({ ...s }), { merge: true });
      }
      for (const t of topics) {
        batch.set(doc(db, `users/${userId}/study_topics/${t.id}`), stripUndefined({ ...t }), { merge: true });
      }
      for (const r of revisions) {
        batch.set(doc(db, `users/${userId}/study_revisions/${r.id}`), stripUndefined({ ...r }), { merge: true });
      }
      for (const m of mistakes) {
        batch.set(doc(db, `users/${userId}/study_mistakes/${m.id}`), stripUndefined({ ...m }), { merge: true });
      }
      batch.set(
        doc(db, `users/${userId}/settings/study_meta`),
        { initialized: true, seededAt: new Date().toISOString() },
        { merge: true }
      );

      await batch.commit();
      return subjects;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/study_subjects`);
      return [];
    }
  },

  async saveStudySubject(userId: string, input: Partial<StudySubject>): Promise<StudySubject> {
    const id = input.id || `subj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_subjects/${id}`;
    let existing: Partial<StudySubject> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          existing = snap.data() as StudySubject;
        }
      } catch {
        // Proceed with defaults if doc does not exist yet
      }
    }
    const item: StudySubject = {
      id,
      userId,
      code: (existing.code ?? input.code ?? `SUB_${Date.now().toString(36).toUpperCase()}`).trim(),
      name: (input.name ?? existing.name ?? 'Subject').trim() || 'Subject',
      tierId: input.tierId ?? existing.tierId ?? 'tier1_sem3',
      semesterOrDomain: input.semesterOrDomain !== undefined ? input.semesterOrDomain : (existing.semesterOrDomain ?? ''),
      targetExam: input.targetExam !== undefined ? input.targetExam : (existing.targetExam ?? ''),
      totalSubtopics: Number(input.totalSubtopics ?? existing.totalSubtopics ?? 0) || 0,
      completedSubtopics: Number(input.completedSubtopics ?? existing.completedSubtopics ?? 0) || 0,
      color: input.color ?? existing.color ?? '#3b82f6',
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudySubject(userId: string, id: string): Promise<void> {
    const directPath = `users/${userId}/study_subjects/${id}`;
    const directDocRef = doc(db, directPath);
    let targetDoc: { ref: DocumentReference; id: string; code: string } | null = null;

    // 1. Direct lookup by ID
    try {
      const snap = await getDoc(directDocRef);
      if (snap.exists()) {
        const data = snap.data() as StudySubject;
        targetDoc = { ref: directDocRef, id: snap.id, code: data.code || id };
      }
    } catch (err: unknown) {
      // Permission and network errors must be surfaced, not swallowed
      handleFirestoreError(err, OperationType.GET, directPath);
    }

    // 2. Fallback search by subject code or id across user's subcollection
    if (!targetDoc) {
      const collectionPath = `users/${userId}/study_subjects`;
      try {
        const snap = await getDocs(collection(db, collectionPath));
        const match = snap.docs.find((d) => {
          const data = d.data() as StudySubject;
          return (
            (d.id === id || data.id === id || data.code === id || data.code?.toLowerCase() === id.toLowerCase()) &&
            !data.deletedAt
          );
        });
        if (match) {
          const data = match.data() as StudySubject;
          targetDoc = { ref: match.ref, id: match.id, code: data.code || id };
        }
      } catch (err: unknown) {
        handleFirestoreError(err, OperationType.LIST, collectionPath);
      }
    }

    // If subject genuinely does not exist or was already deleted, exit gracefully without creating a ghost document
    if (!targetDoc) {
      return;
    }

    // 3. Find active topics belonging to this subject code
    const targetCode = targetDoc.code;
    const topicsCollectionPath = `users/${userId}/study_topics`;
    let activeTopicRefs: DocumentReference[] = [];
    try {
      const topicsSnap = await getDocs(collection(db, topicsCollectionPath));
      activeTopicRefs = topicsSnap.docs
        .filter((d) => {
          const t = d.data() as StudyTopic;
          return t.subjectCode === targetCode && !t.deletedAt;
        })
        .map((d) => d.ref);
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, topicsCollectionPath);
    }

    // 4. Soft delete subject and associated topics
    const nowIso = new Date().toISOString();
    const updatePayload = { deletedAt: nowIso, updatedAt: nowIso };
    const allRefs: DocumentReference[] = [targetDoc.ref, ...activeTopicRefs];

    // Firestore batch limit is 500 operations
    const BATCH_LIMIT = 450;
    if (allRefs.length <= 500) {
      const batch = writeBatch(db);
      for (const ref of allRefs) {
        batch.set(ref, updatePayload, { merge: true });
      }
      try {
        await batch.commit();
      } catch (err: unknown) {
        handleFirestoreError(err, OperationType.WRITE, `users/${userId}/study_subjects/${targetDoc.id}`);
      }
    } else {
      // Safe chunking for operations exceeding batch limit with explicit partial-failure handling
      let committedBatches = 0;
      for (let i = 0; i < allRefs.length; i += BATCH_LIMIT) {
        const chunk = allRefs.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        for (const ref of chunk) {
          batch.set(ref, updatePayload, { merge: true });
        }
        try {
          await batch.commit();
          committedBatches++;
        } catch (err: unknown) {
          console.error(`Multi-batch subject deletion error on chunk ${committedBatches + 1}:`, err);
          const partialNotice =
            committedBatches > 0
              ? `Partial deletion: ${committedBatches} batches committed before error.`
              : `Initial batch commit failed.`;
          throw new Error(
            `Failed to complete multi-batch subject deletion: ${partialNotice} ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }
  },

  async getStudyTopics(userId: string, subjectCode?: string): Promise<StudyTopic[]> {
    const list = await listSubcollection<StudyTopic>(`users/${userId}/study_topics`);
    return list
      .filter((t) => !t.deletedAt && (!subjectCode || t.subjectCode === subjectCode))
      .sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
  },

  async saveStudyTopic(userId: string, input: Partial<StudyTopic>): Promise<StudyTopic> {
    const id = input.id || `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_topics/${id}`;
    let existing: Partial<StudyTopic> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          existing = snap.data() as StudyTopic;
        }
      } catch {
        // Proceed with defaults if doc does not exist yet
      }
    }
    const item: StudyTopic = {
      id,
      userId,
      subjectCode: existing.subjectCode ?? input.subjectCode ?? 'Sub_General',
      unit: input.unit ?? existing.unit ?? 'Unit 1',
      topic: input.topic ?? existing.topic ?? 'General Topic',
      subtopic: input.subtopic ?? existing.subtopic ?? 'Core Concept',
      priority: input.priority ?? existing.priority ?? 'Medium',
      theory: input.theory !== undefined ? Boolean(input.theory) : Boolean(existing.theory),
      practice: input.practice !== undefined ? Boolean(input.practice) : Boolean(existing.practice),
      pyq: input.pyq !== undefined ? Boolean(input.pyq) : Boolean(existing.pyq),
      revisionCount: Number(input.revisionCount ?? existing.revisionCount ?? 0) || 0,
      notes: input.notes !== undefined ? input.notes : (existing.notes ?? ''),
      rowIndex: input.rowIndex !== undefined ? input.rowIndex : (existing.rowIndex ?? 0),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyTopic(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_topics/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  async getStudyRevisions(userId: string): Promise<StudyRevision[]> {
    const list = await listSubcollection<StudyRevision>(`users/${userId}/study_revisions`);
    return list.filter((r) => !r.deletedAt);
  },

  async saveStudyRevision(userId: string, input: Partial<StudyRevision>): Promise<StudyRevision> {
    const id = input.id || `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_revisions/${id}`;
    let existing: Partial<StudyRevision> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          existing = snap.data() as StudyRevision;
        }
      } catch {
        // Proceed with defaults if doc does not exist yet
      }
    }
    const item: StudyRevision = {
      id,
      userId,
      topicId: existing.topicId ?? input.topicId ?? `custom_${Date.now()}`,
      subjectCode: existing.subjectCode ?? input.subjectCode ?? 'Sub_General',
      topicTitle: existing.topicTitle ?? input.topicTitle ?? 'Revision Topic',
      lastStudiedAt: input.lastStudiedAt ?? existing.lastStudiedAt ?? nowIso.slice(0, 10),
      nextRevisionAt: input.nextRevisionAt ?? existing.nextRevisionAt ?? nowIso.slice(0, 10),
      intervalDays: Number(input.intervalDays ?? existing.intervalDays ?? 1) || 1,
      repetition: input.repetition !== undefined ? Number(input.repetition) : (existing.repetition ?? 0),
      difficulty: input.difficulty ?? existing.difficulty ?? 'medium',
      recallScore: input.recallScore !== undefined ? input.recallScore : existing.recallScore,
      status: input.status ?? existing.status ?? 'scheduled',
      notes: input.notes !== undefined ? input.notes : (existing.notes ?? ''),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async recordStudyRecall(userId: string, revisionId: string, difficulty: 'easy' | 'medium' | 'hard'): Promise<StudyRevision | null> {
    const existing = await this.getStudyRevisions(userId);
    const item = existing.find((r) => r.id === revisionId);
    if (!item) return null;
    const updated = processRevisionRecall(item, difficulty);
    await setDoc(doc(db, `users/${userId}/study_revisions/${revisionId}`), stripUndefined({ ...updated }), { merge: true });
    return updated;
  },

  async deleteStudyRevision(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_revisions/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  async getStudyMistakes(userId: string): Promise<StudyMistake[]> {
    const list = await listSubcollection<StudyMistake>(`users/${userId}/study_mistakes`);
    return list.filter((m) => !m.deletedAt);
  },

  async saveStudyMistake(userId: string, input: Partial<StudyMistake>): Promise<StudyMistake> {
    const id = input.id || `mistake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_mistakes/${id}`;
    let existing: Partial<StudyMistake> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          existing = snap.data() as StudyMistake;
        }
      } catch {
        // Proceed with defaults if doc does not exist yet
      }
    }
    const item: StudyMistake = {
      id,
      userId,
      date: input.date ?? existing.date ?? nowIso.slice(0, 10),
      subjectCode: existing.subjectCode ?? input.subjectCode ?? 'Sub_General',
      subjectName: input.subjectName ?? existing.subjectName ?? input.subjectCode ?? 'General',
      topic: input.topic ?? existing.topic ?? 'General Topic',
      source: input.source ?? existing.source ?? 'Practice',
      severity: input.severity ?? existing.severity ?? 'Medium',
      trap: input.trap !== undefined ? input.trap : (existing.trap ?? ''),
      rootCause: input.rootCause !== undefined ? input.rootCause : (existing.rootCause ?? ''),
      goldenRule: input.goldenRule !== undefined ? input.goldenRule : (existing.goldenRule ?? ''),
      resolved: input.resolved !== undefined ? Boolean(input.resolved) : Boolean(existing.resolved),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyMistake(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_mistakes/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY GOALS & MILESTONES (PHASE 16) ---
  async getStudyGoals(userId: string): Promise<StudyGoal[]> {
    const list = await listSubcollection<StudyGoal>(`users/${userId}/study_goals`);
    return list.filter((g) => !g.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveStudyGoal(userId: string, input: Partial<StudyGoal>): Promise<StudyGoal> {
    const id = input.id || `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_goals/${id}`;
    let existing: Partial<StudyGoal> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyGoal;
      } catch {
        // proceed
      }
    }
    const item: StudyGoal = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Academic Goal').trim(),
      description: input.description ?? existing.description ?? '',
      goalType: input.goalType ?? existing.goalType ?? 'monthly',
      subjectId: input.subjectId !== undefined ? input.subjectId : (existing.subjectId ?? null),
      subjectCode: input.subjectCode !== undefined ? input.subjectCode : (existing.subjectCode ?? null),
      targetValue: Number(input.targetValue ?? existing.targetValue ?? 10) || 1,
      currentValue: Number(input.currentValue ?? existing.currentValue ?? 0) || 0,
      unit: input.unit ?? existing.unit ?? 'topics',
      startDate: input.startDate ?? existing.startDate ?? nowIso.slice(0, 10),
      endDate: input.endDate ?? existing.endDate ?? nowIso.slice(0, 10),
      status: input.status ?? existing.status ?? 'active',
      priority: input.priority ?? existing.priority ?? 'medium',
      milestones: Array.isArray(input.milestones) ? input.milestones : (existing.milestones ?? []),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyGoal(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_goals/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY PLANS & RECURRING SCHEDULES (PHASE 16) ---
  async getStudyPlans(userId: string): Promise<StudyPlan[]> {
    const list = await listSubcollection<StudyPlan>(`users/${userId}/study_plans`);
    return list.filter((p) => !p.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveStudyPlan(userId: string, input: Partial<StudyPlan>): Promise<StudyPlan> {
    const id = input.id || `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_plans/${id}`;
    let existing: Partial<StudyPlan> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyPlan;
      } catch {
        // proceed
      }
    }
    const item: StudyPlan = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Study Plan').trim(),
      description: input.description ?? existing.description ?? '',
      planType: input.planType ?? existing.planType ?? 'weekly',
      subjectIds: Array.isArray(input.subjectIds) ? input.subjectIds : (existing.subjectIds ?? []),
      startDate: input.startDate ?? existing.startDate ?? nowIso.slice(0, 10),
      endDate: input.endDate ?? existing.endDate ?? nowIso.slice(0, 10),
      dailyTargetMinutes: Number(input.dailyTargetMinutes ?? existing.dailyTargetMinutes ?? 120) || 0,
      weeklyTargetMinutes: Number(input.weeklyTargetMinutes ?? existing.weeklyTargetMinutes ?? 600) || 0,
      recurringPattern: input.recurringPattern ?? existing.recurringPattern ?? 'none',
      status: input.status ?? existing.status ?? 'active',
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyPlan(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_plans/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY PLAN TASKS (PHASE 16) ---
  async getStudyPlanTasks(userId: string, planId?: string): Promise<StudyPlanTask[]> {
    const list = await listSubcollection<StudyPlanTask>(`users/${userId}/study_plan_tasks`);
    return list
      .filter((t) => !t.deletedAt && (!planId || t.planId === planId))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  },

  async saveStudyPlanTask(userId: string, input: Partial<StudyPlanTask>): Promise<StudyPlanTask> {
    const id = input.id || `ptask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_plan_tasks/${id}`;
    let existing: Partial<StudyPlanTask> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyPlanTask;
      } catch {
        // proceed
      }
    }
    const item: StudyPlanTask = {
      id,
      userId,
      planId: input.planId ?? existing.planId ?? 'default_plan',
      subjectId: input.subjectId !== undefined ? input.subjectId : (existing.subjectId ?? null),
      topicId: input.topicId !== undefined ? input.topicId : (existing.topicId ?? null),
      title: (input.title ?? existing.title ?? 'Plan Task').trim(),
      description: input.description ?? existing.description ?? '',
      scheduledDate: input.scheduledDate ?? existing.scheduledDate ?? nowIso.slice(0, 10),
      startTime: input.startTime !== undefined ? input.startTime : (existing.startTime ?? null),
      endTime: input.endTime !== undefined ? input.endTime : (existing.endTime ?? null),
      estimatedMinutes: Number(input.estimatedMinutes ?? existing.estimatedMinutes ?? 45) || 0,
      actualMinutes: Number(input.actualMinutes ?? existing.actualMinutes ?? 0) || 0,
      priority: input.priority ?? existing.priority ?? 'medium',
      status: input.status ?? existing.status ?? 'pending',
      completedAt: input.completedAt !== undefined ? input.completedAt : (existing.completedAt ?? null),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyPlanTask(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_plan_tasks/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY RESOURCES & REFERENCES (PHASE 16) ---
  async getStudyResources(userId: string): Promise<StudyResource[]> {
    const list = await listSubcollection<StudyResource>(`users/${userId}/study_resources`);
    return list.filter((r) => !r.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveStudyResource(userId: string, input: Partial<StudyResource>): Promise<StudyResource> {
    const id = input.id || `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_resources/${id}`;
    let existing: Partial<StudyResource> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyResource;
      } catch {
        // proceed
      }
    }
    const item: StudyResource = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Study Resource').trim(),
      description: input.description ?? existing.description ?? '',
      resourceType: input.resourceType ?? existing.resourceType ?? 'link',
      subjectId: input.subjectId !== undefined ? input.subjectId : (existing.subjectId ?? null),
      topicId: input.topicId !== undefined ? input.topicId : (existing.topicId ?? null),
      url: input.url !== undefined ? input.url : (existing.url ?? null),
      storagePath: input.storagePath !== undefined ? input.storagePath : (existing.storagePath ?? null),
      tags: Array.isArray(input.tags) ? input.tags : (existing.tags ?? []),
      isBookmarked: input.isBookmarked !== undefined ? Boolean(input.isBookmarked) : Boolean(existing.isBookmarked),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyResource(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_resources/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY EXAMS & RESULTS (PHASE 16) ---
  async getStudyExams(userId: string): Promise<StudyExam[]> {
    const list = await listSubcollection<StudyExam>(`users/${userId}/study_exams`);
    return list.filter((e) => !e.deletedAt).sort((a, b) => a.examDate.localeCompare(b.examDate));
  },

  async saveStudyExam(userId: string, input: Partial<StudyExam>): Promise<StudyExam> {
    const id = input.id || `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_exams/${id}`;
    let existing: Partial<StudyExam> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyExam;
      } catch {
        // proceed
      }
    }
    const item: StudyExam = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Academic Exam').trim(),
      examType: input.examType ?? existing.examType ?? 'Semester',
      subjectIds: Array.isArray(input.subjectIds) ? input.subjectIds : (existing.subjectIds ?? []),
      examDate: input.examDate ?? existing.examDate ?? nowIso.slice(0, 10),
      startTime: input.startTime !== undefined ? input.startTime : (existing.startTime ?? null),
      durationMinutes: Number(input.durationMinutes ?? existing.durationMinutes ?? 180) || 60,
      totalMarks: Number(input.totalMarks ?? existing.totalMarks ?? 100) || 100,
      obtainedMarks: input.obtainedMarks !== undefined ? (input.obtainedMarks === null ? null : Number(input.obtainedMarks)) : (existing.obtainedMarks ?? null),
      syllabusTopicIds: Array.isArray(input.syllabusTopicIds) ? input.syllabusTopicIds : (existing.syllabusTopicIds ?? []),
      preparationStatus: input.preparationStatus ?? existing.preparationStatus ?? 'not_started',
      resultStatus: input.resultStatus ?? existing.resultStatus ?? 'pending',
      notes: input.notes ?? existing.notes ?? '',
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyExam(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_exams/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY NOTES (PHASE 16) ---
  async getStudyNotes(userId: string): Promise<StudyNote[]> {
    const list = await listSubcollection<StudyNote>(`users/${userId}/study_notes`);
    return list.filter((n) => !n.deletedAt).sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));
  },

  async saveStudyNote(userId: string, input: Partial<StudyNote>): Promise<StudyNote> {
    const id = input.id || `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_notes/${id}`;
    let existing: Partial<StudyNote> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyNote;
      } catch {
        // proceed
      }
    }
    const item: StudyNote = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Untitled Note').trim(),
      content: input.content ?? existing.content ?? '',
      subjectId: input.subjectId !== undefined ? input.subjectId : (existing.subjectId ?? null),
      topicId: input.topicId !== undefined ? input.topicId : (existing.topicId ?? null),
      tags: Array.isArray(input.tags) ? input.tags : (existing.tags ?? []),
      isPinned: input.isPinned !== undefined ? Boolean(input.isPinned) : Boolean(existing.isPinned),
      isBookmarked: input.isBookmarked !== undefined ? Boolean(input.isBookmarked) : Boolean(existing.isBookmarked),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async deleteStudyNote(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_notes/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY ACTIVITY LOGS (PHASE 16 APPEND-ONLY) ---
  async getStudyActivityLogs(userId: string, limitCount = 50): Promise<StudyActivityLog[]> {
    const list = await listSubcollection<StudyActivityLog>(`users/${userId}/study_activity_logs`);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limitCount);
  },

  async recordStudyActivityLog(
    userId: string,
    entry: Omit<StudyActivityLog, 'id' | 'userId' | 'createdAt'>
  ): Promise<StudyActivityLog> {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_activity_logs/${id}`;
    const logItem: StudyActivityLog = {
      id,
      userId,
      activityType: entry.activityType,
      subjectId: entry.subjectId || null,
      topicId: entry.topicId || null,
      planId: entry.planId || null,
      taskId: entry.taskId || null,
      description: entry.description,
      metadata: entry.metadata || {},
      activityDate: entry.activityDate || nowIso.slice(0, 10),
      createdAt: nowIso,
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...logItem }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return logItem;
  },

  // --- STUDY FLASHCARDS (PHASE 16 ACTIVE RECALL) ---
  async getStudyFlashcards(userId: string, topicId?: string): Promise<StudyFlashcard[]> {
    const list = await listSubcollection<StudyFlashcard>(`users/${userId}/study_flashcards`);
    return list
      .filter((c) => !c.deletedAt && (!topicId || c.topicId === topicId))
      .sort((a, b) => (a.nextReviewAt || '').localeCompare(b.nextReviewAt || ''));
  },

  async saveStudyFlashcard(userId: string, input: Partial<StudyFlashcard>): Promise<StudyFlashcard> {
    const id = input.id || `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_flashcards/${id}`;
    let existing: Partial<StudyFlashcard> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyFlashcard;
      } catch {
        // proceed
      }
    }
    const item: StudyFlashcard = {
      id,
      userId,
      subjectId: input.subjectId !== undefined ? input.subjectId : (existing.subjectId ?? null),
      topicId: input.topicId !== undefined ? input.topicId : (existing.topicId ?? null),
      question: (input.question ?? existing.question ?? '').trim(),
      answer: (input.answer ?? existing.answer ?? '').trim(),
      difficulty: input.difficulty ?? existing.difficulty ?? 'medium',
      reviewCount: Number(input.reviewCount ?? existing.reviewCount ?? 0) || 0,
      lastReviewedAt: input.lastReviewedAt !== undefined ? input.lastReviewedAt : (existing.lastReviewedAt ?? null),
      nextReviewAt: input.nextReviewAt !== undefined ? input.nextReviewAt : (existing.nextReviewAt ?? nowIso.slice(0, 10)),
      isBookmarked: input.isBookmarked !== undefined ? Boolean(input.isBookmarked) : Boolean(existing.isBookmarked),
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async reviewStudyFlashcard(
    userId: string,
    id: string,
    difficulty: 'easy' | 'medium' | 'hard'
  ): Promise<StudyFlashcard | null> {
    const path = `users/${userId}/study_flashcards/${id}`;
    const snap = await getDoc(doc(db, path));
    if (!snap.exists()) return null;
    const existing = snap.data() as StudyFlashcard;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const ladderDays = difficulty === 'easy' ? 7 : difficulty === 'medium' ? 3 : 1;
    const nextDate = new Date(now.getTime() + ladderDays * 86400000).toISOString().slice(0, 10);

    const updated: Partial<StudyFlashcard> = {
      ...existing,
      difficulty,
      reviewCount: (existing.reviewCount || 0) + 1,
      lastReviewedAt: todayStr,
      nextReviewAt: nextDate,
      updatedAt: now.toISOString(),
    };
    await setDoc(doc(db, path), stripUndefined({ ...updated }), { merge: true });
    return updated as StudyFlashcard;
  },

  async deleteStudyFlashcard(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_flashcards/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- STUDY QUIZZES (PHASE 16 SELF-ASSESSMENT) ---
  async getStudyQuizzes(userId: string): Promise<StudyQuiz[]> {
    const list = await listSubcollection<StudyQuiz>(`users/${userId}/study_quizzes`);
    return list.filter((q) => !q.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveStudyQuiz(userId: string, input: Partial<StudyQuiz>): Promise<StudyQuiz> {
    const id = input.id || `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/study_quizzes/${id}`;
    let existing: Partial<StudyQuiz> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as StudyQuiz;
      } catch {
        // proceed
      }
    }
    const item: StudyQuiz = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Practice Quiz').trim(),
      subjectId: input.subjectId !== undefined ? input.subjectId : (existing.subjectId ?? null),
      topicId: input.topicId !== undefined ? input.topicId : (existing.topicId ?? null),
      questions: Array.isArray(input.questions) ? input.questions : (existing.questions ?? []),
      attempts: Array.isArray(input.attempts) ? input.attempts : (existing.attempts ?? []),
      highestScore: Number(input.highestScore ?? existing.highestScore ?? 0) || 0,
      createdAt: input.createdAt ?? existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...item }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return item;
  },

  async recordStudyQuizAttempt(
    userId: string,
    quizId: string,
    attempt: { score: number; totalQuestions: number; timeTakenSeconds: number }
  ): Promise<StudyQuiz | null> {
    const path = `users/${userId}/study_quizzes/${quizId}`;
    const snap = await getDoc(doc(db, path));
    if (!snap.exists()) return null;
    const existing = snap.data() as StudyQuiz;
    const percentage = Math.round((attempt.score / Math.max(1, attempt.totalQuestions)) * 100);
    const newAttempt = {
      id: `att_${Date.now()}`,
      attemptedAt: new Date().toISOString(),
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      percentage,
      timeTakenSeconds: attempt.timeTakenSeconds,
    };
    const attempts = [...(existing.attempts || []), newAttempt];
    const highestScore = Math.max(existing.highestScore || 0, percentage);
    const updated = {
      ...existing,
      attempts,
      highestScore,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, path), stripUndefined({ ...updated }), { merge: true });
    return updated as StudyQuiz;
  },

  async deleteStudyQuiz(userId: string, id: string): Promise<void> {
    await setDoc(
      doc(db, `users/${userId}/study_quizzes/${id}`),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
  },

  // --- POMODORO PRESETS (STANDARD & CUSTOM WORKFLOWS) ---
  async getPomodoroPresets(userId: string): Promise<PomodoroPreset[]> {
    const list = await listSubcollection<PomodoroPreset>(`users/${userId}/pomodoro_presets`);
    const active = list.filter((p) => !p.deletedAt);
    if (active.length === 0) {
      // Idempotently seed system presets for user
      const defaultPresets: Omit<PomodoroPreset, 'userId'>[] = [
        {
          id: 'sys_preset_classic',
          name: 'Classic 25/5',
          description: 'Standard Pomodoro technique interval with short focused bursts',
          workDuration: 25,
          shortBreakDuration: 5,
          longBreakDuration: 15,
          longBreakInterval: 4,
          autoStartBreaks: false,
          autoStartFocus: false,
          soundEnabled: true,
          soundVolume: 70,
          isDefault: true,
          isSystemPreset: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 'sys_preset_deep_work',
          name: 'Deep Work 50/10',
          description: 'Extended focus block ideal for programming, writing and complex reasoning',
          workDuration: 50,
          shortBreakDuration: 10,
          longBreakDuration: 20,
          longBreakInterval: 4,
          autoStartBreaks: false,
          autoStartFocus: false,
          soundEnabled: true,
          soundVolume: 70,
          isDefault: false,
          isSystemPreset: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 'sys_preset_ultradian',
          name: 'Ultradian 90/20',
          description: '90-minute natural biological rhythm for sustained creative output',
          workDuration: 90,
          shortBreakDuration: 20,
          longBreakDuration: 30,
          longBreakInterval: 2,
          autoStartBreaks: false,
          autoStartFocus: false,
          soundEnabled: true,
          soundVolume: 70,
          isDefault: false,
          isSystemPreset: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        },
      ];

      const seeded: PomodoroPreset[] = [];
      for (const sys of defaultPresets) {
        const item: PomodoroPreset = { ...sys, userId };
        try {
          await setDoc(doc(db, `users/${userId}/pomodoro_presets/${sys.id}`), item, { merge: true });
          seeded.push(item);
        } catch {
          seeded.push(item);
        }
      }
      return seeded;
    }
    return active.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.createdAt.localeCompare(b.createdAt));
  },

  async savePomodoroPreset(userId: string, input: Partial<PomodoroPreset>): Promise<PomodoroPreset> {
    const id = input.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/pomodoro_presets/${id}`;
    let existing: Partial<PomodoroPreset> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as PomodoroPreset;
      } catch {}
    }
    const preset: PomodoroPreset = {
      id,
      userId,
      name: (input.name ?? existing.name ?? 'Custom Preset').trim().slice(0, 128),
      description: input.description ?? existing.description,
      workDuration: Math.max(1, Math.min(180, Number(input.workDuration ?? existing.workDuration ?? 25))),
      shortBreakDuration: Math.max(1, Math.min(60, Number(input.shortBreakDuration ?? existing.shortBreakDuration ?? 5))),
      longBreakDuration: Math.max(1, Math.min(90, Number(input.longBreakDuration ?? existing.longBreakDuration ?? 15))),
      longBreakInterval: Math.max(1, Math.min(12, Number(input.longBreakInterval ?? existing.longBreakInterval ?? 4))),
      autoStartBreaks: input.autoStartBreaks !== undefined ? Boolean(input.autoStartBreaks) : (existing.autoStartBreaks ?? false),
      autoStartFocus: input.autoStartFocus !== undefined ? Boolean(input.autoStartFocus) : (existing.autoStartFocus ?? false),
      soundEnabled: input.soundEnabled !== undefined ? Boolean(input.soundEnabled) : (existing.soundEnabled ?? true),
      soundVolume: Math.max(0, Math.min(100, Number(input.soundVolume ?? existing.soundVolume ?? 70))),
      isDefault: input.isDefault !== undefined ? Boolean(input.isDefault) : (existing.isDefault ?? false),
      isSystemPreset: existing.isSystemPreset ?? false,
      createdAt: existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...preset }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return preset;
  },

  async deletePomodoroPreset(userId: string, id: string): Promise<void> {
    const path = `users/${userId}/pomodoro_presets/${id}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) return;
      const nowIso = new Date().toISOString();
      await setDoc(doc(db, path), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // --- POMODORO GOALS (DAILY, WEEKLY, MONTHLY & CUSTOM) ---
  async getPomodoroGoals(userId: string): Promise<PomodoroGoal[]> {
    const list = await listSubcollection<PomodoroGoal>(`users/${userId}/pomodoro_goals`);
    return list
      .filter((g) => !g.deletedAt)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async savePomodoroGoal(userId: string, input: Partial<PomodoroGoal>): Promise<PomodoroGoal> {
    const id = input.id || `pgoal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/pomodoro_goals/${id}`;
    let existing: Partial<PomodoroGoal> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as PomodoroGoal;
      } catch {}
    }

    const goalType = (input.goalType ?? existing.goalType ?? 'daily') as PomodoroGoal['goalType'];
    const metricType = (input.metricType ?? existing.metricType ?? 'focus_minutes') as PomodoroGoal['metricType'];
    const status = (input.status ?? existing.status ?? 'active') as PomodoroGoal['status'];

    const targetValue = Math.max(
      1,
      Number(
        input.targetValue ??
          existing.targetValue ??
          input.dailyTargetMinutes ??
          existing.dailyTargetMinutes ??
          120
      )
    );

    const goal: PomodoroGoal = {
      id,
      userId,
      title: (input.title ?? existing.title ?? 'Focus Goal').trim().slice(0, 256),
      description: input.description ?? existing.description,
      goalType,
      metricType,
      targetValue,
      currentValue: Number(input.currentValue ?? existing.currentValue ?? 0),
      subjectId: input.subjectId !== undefined ? input.subjectId : (existing.subjectId ?? null),
      subjectCode: input.subjectCode !== undefined ? input.subjectCode : (existing.subjectCode ?? null),
      topicId: input.topicId !== undefined ? input.topicId : (existing.topicId ?? null),
      startDate: input.startDate ?? existing.startDate ?? nowIso.split('T')[0],
      endDate: input.endDate !== undefined ? input.endDate : (existing.endDate ?? null),
      status,
      createdAt: existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      completedAt: input.completedAt !== undefined ? input.completedAt : (existing.completedAt ?? null),
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing.deletedAt ?? null),
      // Backward compatibility fields
      dailyTargetMinutes: targetValue,
      weeklyTargetMinutes: targetValue * 5,
      targetDaysPerWeek: existing.targetDaysPerWeek ?? 5,
      isActive: status === 'active',
    };

    try {
      await setDoc(doc(db, path), stripUndefined({ ...goal }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return goal;
  },

  async deletePomodoroGoal(userId: string, id: string): Promise<void> {
    const path = `users/${userId}/pomodoro_goals/${id}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) return;
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, path),
        { deletedAt: nowIso, updatedAt: nowIso },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // --- AMBIENT SOUND PRESETS (SOUNDSCAPE CUSTOMIZATION) ---
  async getPomodoroAmbientPresets(userId: string): Promise<PomodoroAmbientPreset[]> {
    const list = await listSubcollection<PomodoroAmbientPreset>(`users/${userId}/pomodoro_ambient_presets`);
    return list.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
  },

  async savePomodoroAmbientPreset(
    userId: string,
    input: Partial<PomodoroAmbientPreset>
  ): Promise<PomodoroAmbientPreset> {
    const id = input.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const path = `users/${userId}/pomodoro_ambient_presets/${id}`;
    let existing: Partial<PomodoroAmbientPreset> = {};
    if (input.id) {
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) existing = snap.data() as PomodoroAmbientPreset;
      } catch {}
    }
    const preset: PomodoroAmbientPreset = {
      id,
      userId,
      name: (input.name ?? existing.name ?? 'Custom Ambience').trim().slice(0, 128),
      soundType: input.soundType ?? existing.soundType ?? 'rain',
      volume: Math.max(0, Math.min(1, Number(input.volume ?? existing.volume ?? 0.35))),
      isFavorite: input.isFavorite !== undefined ? Boolean(input.isFavorite) : (existing.isFavorite ?? false),
      createdAt: existing.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    try {
      await setDoc(doc(db, path), stripUndefined({ ...preset }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
    return preset;
  },

  async deletePomodoroAmbientPreset(userId: string, id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, `users/${userId}/pomodoro_ambient_presets/${id}`));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/pomodoro_ambient_presets/${id}`);
    }
  },

  async getPomodoroSettings(userId: string): Promise<PomodoroSettings | null> {
    const pomPath = `users/${userId}/pomodoro_settings/default`;
    let pomDoc: Partial<PomodoroSettings> | null = null;
    try {
      const snap = await getDoc(doc(db, pomPath));
      if (snap.exists()) {
        pomDoc = snap.data() as Partial<PomodoroSettings>;
      }
    } catch {
      // Fallback to general settings if pomodoro_settings doc is absent
    }

    const s = await this.getSettings(userId);
    if (!s && !pomDoc) return null;

    return {
      id: 'default',
      userId,
      focusDuration: pomDoc?.focusDuration ?? s?.pomodoroWorkDuration ?? 25,
      shortBreakDuration: pomDoc?.shortBreakDuration ?? s?.shortBreakDuration ?? 5,
      longBreakDuration: pomDoc?.longBreakDuration ?? s?.longBreakDuration ?? 15,
      longBreakInterval: pomDoc?.longBreakInterval ?? s?.longBreakInterval ?? 4,
      autoStartBreaks: pomDoc?.autoStartBreaks ?? s?.autoSwitchSessions ?? false,
      autoStartFocus: pomDoc?.autoStartFocus ?? s?.autoSwitchSessions ?? false,
      alertTone: pomDoc?.alertTone ?? 'chime',
      soundVolume: pomDoc?.soundVolume ?? s?.soundVolume ?? 70,
      ambientPreset: pomDoc?.ambientPreset ?? 'off',
      ambientVolume: pomDoc?.ambientVolume ?? 0.35,
      desktopNotifications: pomDoc?.desktopNotifications ?? false,
      tickingSoundEnabled: pomDoc?.tickingSoundEnabled ?? false,
      selectedPresetId: pomDoc?.selectedPresetId ?? s?.selectedPresetId ?? null,
      updatedAt: pomDoc?.updatedAt || s?.updatedAt || new Date().toISOString(),
    };
  },

  async savePomodoroSettings(
    userId: string,
    input: Partial<PomodoroSettings>
  ): Promise<PomodoroSettings> {
    const pomPath = `users/${userId}/pomodoro_settings/default`;
    const existing = await this.getPomodoroSettings(userId);
    const nowIso = new Date().toISOString();

    const merged: PomodoroSettings = {
      id: 'default',
      userId,
      focusDuration: input.focusDuration ?? existing?.focusDuration ?? 25,
      shortBreakDuration: input.shortBreakDuration ?? existing?.shortBreakDuration ?? 5,
      longBreakDuration: input.longBreakDuration ?? existing?.longBreakDuration ?? 15,
      longBreakInterval: input.longBreakInterval ?? existing?.longBreakInterval ?? 4,
      autoStartBreaks: input.autoStartBreaks ?? existing?.autoStartBreaks ?? false,
      autoStartFocus: input.autoStartFocus ?? existing?.autoStartFocus ?? false,
      alertTone: input.alertTone ?? existing?.alertTone ?? 'chime',
      soundVolume: input.soundVolume ?? existing?.soundVolume ?? 70,
      ambientPreset: input.ambientPreset ?? existing?.ambientPreset ?? 'off',
      ambientVolume: input.ambientVolume ?? existing?.ambientVolume ?? 0.35,
      desktopNotifications: input.desktopNotifications ?? existing?.desktopNotifications ?? false,
      tickingSoundEnabled: input.tickingSoundEnabled ?? existing?.tickingSoundEnabled ?? false,
      selectedPresetId:
        input.selectedPresetId !== undefined ? input.selectedPresetId : (existing?.selectedPresetId ?? null),
      updatedAt: nowIso,
    };

    try {
      await setDoc(doc(db, pomPath), stripUndefined({ ...merged }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, pomPath);
    }

    const patch: Partial<UserSettings> = { userId, updatedAt: nowIso };
    if (input.focusDuration !== undefined) patch.pomodoroWorkDuration = input.focusDuration;
    if (input.shortBreakDuration !== undefined) patch.shortBreakDuration = input.shortBreakDuration;
    if (input.longBreakDuration !== undefined) patch.longBreakDuration = input.longBreakDuration;
    if (input.longBreakInterval !== undefined) patch.longBreakInterval = input.longBreakInterval;
    if (input.autoStartBreaks !== undefined || input.autoStartFocus !== undefined) {
      patch.autoSwitchSessions = merged.autoStartBreaks || merged.autoStartFocus;
    }
    if (input.soundVolume !== undefined) patch.soundVolume = input.soundVolume;
    if (input.selectedPresetId !== undefined) patch.selectedPresetId = input.selectedPresetId;

    await this.saveSettings(userId, patch);
    return merged;
  },

  // ==========================================
  // JOINT VAULTS (COUPLE SHARED SAVINGS)
  // ==========================================

  async getJointVaults(user: FirebaseUser): Promise<VaultSummary[]> {
    const q = query(collection(db, 'sharedVaults'), where('memberUids', 'array-contains', user.uid));
    try {
      const snap = await getDocs(q);
      const summaries: VaultSummary[] = [];
      for (const d of snap.docs) {
        const sum = await this.getJointVault(d.id, user);
        if (sum) summaries.push(sum);
      }
      return summaries;
    } catch (err) {
      console.warn('[firestoreService] getJointVaults query failed:', err);
      return [];
    }
  },

  async getJointVault(vaultId: string, user: FirebaseUser): Promise<VaultSummary | null> {
    const vaultRef = doc(db, 'sharedVaults', vaultId);
    try {
      const vaultSnap = await getDoc(vaultRef);
      if (!vaultSnap.exists()) return null;
      const vault = vaultSnap.data() as JointVault;
      if (!vault.memberUids.includes(user.uid)) return null;

      const [membersSnap, contribSnap, expSnap, settleSnap, actSnap] = await Promise.all([
        getDocs(collection(db, `sharedVaults/${vaultId}/members`)),
        getDocs(collection(db, `sharedVaults/${vaultId}/contributions`)),
        getDocs(collection(db, `sharedVaults/${vaultId}/expenses`)),
        getDocs(collection(db, `sharedVaults/${vaultId}/settlements`)),
        getDocs(query(collection(db, `sharedVaults/${vaultId}/activity`), limit(30))),
      ]);

      const members = membersSnap.docs.map((d) => d.data() as VaultMember);
      const contributions = contribSnap.docs.map((d) => d.data() as VaultContribution);
      const expenses = expSnap.docs.map((d) => d.data() as VaultExpense);
      const settlements = settleSnap.docs.map((d) => d.data() as VaultSettlement);
      const activities = actSnap.docs.map((d) => d.data() as VaultActivity);

      return buildVaultSummary(vault, members, contributions, expenses, settlements, activities);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `sharedVaults/${vaultId}`);
      return null;
    }
  },

  async createJointVault(
    user: FirebaseUser,
    data: {
      name: string;
      description?: string;
      targetPaise: number;
      monthlyTargetPaise?: number;
      currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
      targetRatio?: Record<string, number>;
    }
  ): Promise<JointVault> {
    const nowIso = new Date().toISOString();
    const vaultId = `vlt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const currency = data.currency || 'INR';

    const vault: JointVault = {
      id: vaultId,
      name: data.name.trim(),
      description: (data.description || '').trim(),
      currency,
      targetPaise: data.targetPaise,
      monthlyTargetPaise: data.monthlyTargetPaise || Math.round(data.targetPaise / 10),
      createdBy: user.uid,
      memberUids: [user.uid],
      targetRatio: data.targetRatio && isValidRatio(data.targetRatio, [user.uid]) ? data.targetRatio : { [user.uid]: 100 },
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const creatorMember: VaultMember = {
      uid: user.uid,
      email: user.email || `${user.uid}@focusflow.app`,
      name: user.displayName || 'Vault Creator',
      role: 'creator',
      status: 'active',
      joinedAt: nowIso,
    };

    const activity: VaultActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: user.uid,
      actorName: creatorMember.name,
      type: 'vault_created',
      title: 'Joint Vault Created',
      description: `${creatorMember.name} created the vault "${vault.name}"`,
      timestamp: nowIso,
    };

    try {
      await setDoc(doc(db, 'sharedVaults', vaultId), stripUndefined({ ...vault }));
      const batch = writeBatch(db);
      batch.set(doc(db, `sharedVaults/${vaultId}/members`, user.uid), stripUndefined({ ...creatorMember }));
      batch.set(doc(db, `sharedVaults/${vaultId}/activity`, activity.id), stripUndefined({ ...activity }));
      await batch.commit();
      return vault;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sharedVaults/${vaultId}`);
      throw err;
    }
  },

  async createVaultInvitation(
    user: FirebaseUser,
    vaultId: string,
    invitedEmail?: string
  ): Promise<VaultInvitation> {
    const vaultRef = doc(db, 'sharedVaults', vaultId);
    const vaultSnap = await getDoc(vaultRef);
    if (!vaultSnap.exists()) throw new Error('Vault not found');
    const vault = vaultSnap.data() as JointVault;
    if (!vault.memberUids.includes(user.uid)) throw new Error('Unauthorized');
    if (vault.memberUids.length >= 2) throw new Error('Vault already has maximum members (2)');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let inviteCode = '';
    for (let i = 0; i < 10; i++) {
      inviteCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const invitation: VaultInvitation = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      vaultName: vault.name,
      invitedByUid: user.uid,
      invitedByName: user.displayName || 'Vault Partner',
      inviteCode,
      invitedEmail: invitedEmail ? invitedEmail.trim() : undefined,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
    };

    try {
      await setDoc(doc(db, `sharedVaults/${vaultId}/invitations`, invitation.id), stripUndefined({ ...invitation }));
      return invitation;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sharedVaults/${vaultId}/invitations`);
      throw err;
    }
  },

  async acceptVaultInvitation(
    user: FirebaseUser,
    inviteCode: string
  ): Promise<{ vault: JointVault; invitation: VaultInvitation }> {
    const code = inviteCode.trim().toUpperCase();
    return await runTransaction(db, async (tx) => {
      const vaultSnapshots = await getDocs(collection(db, 'sharedVaults'));
      let foundInvite: VaultInvitation | null = null;
      let targetVault: JointVault | null = null;

      for (const vDoc of vaultSnapshots.docs) {
        const invSnap = await getDocs(query(collection(db, `sharedVaults/${vDoc.id}/invitations`), where('inviteCode', '==', code), where('status', '==', 'pending')));
        if (!invSnap.empty) {
          foundInvite = invSnap.docs[0].data() as VaultInvitation;
          targetVault = vDoc.data() as JointVault;
          break;
        }
      }

      if (!foundInvite || !targetVault) {
        throw new Error('Invalid or already accepted invitation code');
      }
      if (new Date(foundInvite.expiresAt) <= new Date()) {
        throw new Error('Invitation code has expired');
      }
      if (targetVault.memberUids.length >= 2) {
        throw new Error('Vault already has maximum members (2)');
      }
      if (targetVault.memberUids.includes(user.uid)) {
        throw new Error('You are already a member of this vault');
      }

      const nowIso = new Date().toISOString();
      const updatedMembers = [...targetVault.memberUids, user.uid];
      const updatedRatio = { [targetVault.createdBy]: 50, [user.uid]: 50 };

      foundInvite.status = 'accepted';
      foundInvite.acceptedByUid = user.uid;
      foundInvite.acceptedAt = nowIso;

      const newMember: VaultMember = {
        uid: user.uid,
        email: user.email || `${user.uid}@focusflow.app`,
        name: user.displayName || 'Partner',
        role: 'partner',
        status: 'active',
        joinedAt: nowIso,
      };

      const activity: VaultActivity = {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        vaultId: targetVault.id,
        actorUid: user.uid,
        actorName: newMember.name,
        type: 'member_joined',
        title: 'Partner Joined Vault',
        description: `${newMember.name} joined "${targetVault.name}"`,
        timestamp: nowIso,
      };

      tx.update(doc(db, 'sharedVaults', targetVault.id), {
        memberUids: updatedMembers,
        targetRatio: updatedRatio,
        updatedAt: nowIso,
      });
      tx.set(doc(db, `sharedVaults/${targetVault.id}/members`, user.uid), stripUndefined({ ...newMember }));
      tx.update(doc(db, `sharedVaults/${targetVault.id}/invitations`, foundInvite.id), {
        status: 'accepted',
        acceptedByUid: user.uid,
        acceptedAt: nowIso,
      });
      tx.set(doc(db, `sharedVaults/${targetVault.id}/activity`, activity.id), stripUndefined({ ...activity }));

      targetVault.memberUids = updatedMembers;
      targetVault.targetRatio = updatedRatio;
      return { vault: targetVault, invitation: foundInvite };
    });
  },

  async addVaultContribution(
    user: FirebaseUser,
    vaultId: string,
    data: { amountPaise: number; date?: string; description?: string }
  ): Promise<VaultContribution> {
    const nowIso = new Date().toISOString();
    const contributionId = `vcb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const contribution: VaultContribution = {
      id: contributionId,
      vaultId,
      contributedByUid: user.uid,
      contributorName: user.displayName || 'Member',
      amountPaise: data.amountPaise,
      date: data.date || nowIso.slice(0, 10),
      description: (data.description || 'Shared savings contribution').trim(),
      createdAt: nowIso,
      status: 'active',
    };

    const activity: VaultActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: user.uid,
      actorName: contribution.contributorName,
      type: 'contribution_added',
      title: 'Contribution Added',
      description: `${contribution.contributorName} contributed savings`,
      amountPaise: contribution.amountPaise,
      timestamp: nowIso,
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `sharedVaults/${vaultId}/contributions`, contributionId), stripUndefined({ ...contribution }));
      batch.set(doc(db, `sharedVaults/${vaultId}/activity`, activity.id), stripUndefined({ ...activity }));
      await batch.commit();
      return contribution;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sharedVaults/${vaultId}/contributions`);
      throw err;
    }
  },

  async reverseVaultContribution(
    user: FirebaseUser,
    vaultId: string,
    contributionId: string,
    reason: string
  ): Promise<VaultContribution> {
    const contribRef = doc(db, `sharedVaults/${vaultId}/contributions`, contributionId);
    const snap = await getDoc(contribRef);
    if (!snap.exists()) throw new Error('Contribution not found');
    const contribution = snap.data() as VaultContribution;
    if (contribution.status !== 'active') throw new Error('Already reversed');

    const nowIso = new Date().toISOString();
    contribution.status = 'reversed';
    contribution.reversedAt = nowIso;
    contribution.reversedByUid = user.uid;
    contribution.reversalReason = reason.trim();

    const activity: VaultActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: user.uid,
      actorName: user.displayName || 'Member',
      type: 'contribution_reversed',
      title: 'Contribution Reversed',
      description: `Contribution was reversed: ${contribution.reversalReason}`,
      amountPaise: contribution.amountPaise,
      timestamp: nowIso,
    };

    try {
      const batch = writeBatch(db);
      batch.update(contribRef, {
        status: 'reversed',
        reversedAt: nowIso,
        reversedByUid: user.uid,
        reversalReason: contribution.reversalReason,
      });
      batch.set(doc(db, `sharedVaults/${vaultId}/activity`, activity.id), stripUndefined({ ...activity }));
      await batch.commit();
      return contribution;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sharedVaults/${vaultId}/contributions`);
      throw err;
    }
  },

  async addVaultExpense(
    user: FirebaseUser,
    vaultId: string,
    data: {
      amountPaise: number;
      description: string;
      date?: string;
      splitMode?: ExpenseSplitMode;
      customShares?: Record<string, number>;
    }
  ): Promise<VaultExpense> {
    const vaultRef = doc(db, 'sharedVaults', vaultId);
    const vaultSnap = await getDoc(vaultRef);
    if (!vaultSnap.exists()) throw new Error('Vault not found');
    const vault = vaultSnap.data() as JointVault;

    const uidA = vault.memberUids[0];
    const uidB = vault.memberUids[1] || uidA;
    const ratioA = vault.targetRatio[uidA] ?? 50;
    const splitMode = data.splitMode || 'equal';
    const memberShares = splitExpense(data.amountPaise, splitMode, uidA, uidB, ratioA, data.customShares);

    const nowIso = new Date().toISOString();
    const expenseId = `vex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const expense: VaultExpense = {
      id: expenseId,
      vaultId,
      paidByUid: user.uid,
      payerName: user.displayName || 'Member',
      amountPaise: data.amountPaise,
      description: data.description.trim(),
      date: data.date || nowIso.slice(0, 10),
      splitMode,
      memberShares,
      createdAt: nowIso,
      status: 'active',
    };

    const activity: VaultActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: user.uid,
      actorName: expense.payerName,
      type: 'expense_added',
      title: 'Joint Expense Recorded',
      description: `${expense.payerName} paid for "${expense.description}"`,
      amountPaise: expense.amountPaise,
      timestamp: nowIso,
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `sharedVaults/${vaultId}/expenses`, expenseId), stripUndefined({ ...expense }));
      batch.set(doc(db, `sharedVaults/${vaultId}/activity`, activity.id), stripUndefined({ ...activity }));
      await batch.commit();
      return expense;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sharedVaults/${vaultId}/expenses`);
      throw err;
    }
  },

  async recordVaultSettlement(
    user: FirebaseUser,
    vaultId: string,
    data: { toUid: string; toName?: string; amountPaise: number; date?: string; notes?: string }
  ): Promise<VaultSettlement> {
    const nowIso = new Date().toISOString();
    const settlementId = `vstl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const settlement: VaultSettlement = {
      id: settlementId,
      vaultId,
      fromUid: user.uid,
      fromName: user.displayName || 'Member',
      toUid: data.toUid,
      toName: data.toName || 'Partner',
      amountPaise: data.amountPaise,
      date: data.date || nowIso.slice(0, 10),
      notes: (data.notes || 'Settlement payment').trim(),
      createdAt: nowIso,
    };

    const activity: VaultActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: user.uid,
      actorName: settlement.fromName,
      type: 'settlement_recorded',
      title: 'Settlement Payment Recorded',
      description: `${settlement.fromName} paid reimbursement to ${settlement.toName}`,
      amountPaise: settlement.amountPaise,
      timestamp: nowIso,
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `sharedVaults/${vaultId}/settlements`, settlementId), stripUndefined({ ...settlement }));
      batch.set(doc(db, `sharedVaults/${vaultId}/activity`, activity.id), stripUndefined({ ...activity }));
      await batch.commit();
      return settlement;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sharedVaults/${vaultId}/settlements`);
      throw err;
    }
  },

  async updateVaultRatio(
    user: FirebaseUser,
    vaultId: string,
    targetRatio: Record<string, number>
  ): Promise<JointVault> {
    const vaultRef = doc(db, 'sharedVaults', vaultId);
    const snap = await getDoc(vaultRef);
    if (!snap.exists()) throw new Error('Vault not found');
    const vault = snap.data() as JointVault;
    if (!vault.memberUids.includes(user.uid)) throw new Error('Unauthorized');

    if (!isValidRatio(targetRatio, vault.memberUids)) {
      throw new Error('Invalid ratio: must sum to 100');
    }

    const nowIso = new Date().toISOString();
    vault.targetRatio = targetRatio;
    vault.updatedAt = nowIso;

    try {
      await setDoc(vaultRef, { targetRatio, updatedAt: nowIso }, { merge: true });
      return vault;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sharedVaults/${vaultId}`);
      throw err;
    }
  },

  subscribeToVault(vaultId: string, onUpdate: (summary: VaultSummary | null) => void): Unsubscribe {
    const vaultRef = doc(db, 'sharedVaults', vaultId);
    return onSnapshot(vaultRef, async (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const vault = snap.data() as JointVault;
      const [membersSnap, contribSnap, expSnap, settleSnap, actSnap] = await Promise.all([
        getDocs(collection(db, `sharedVaults/${vaultId}/members`)),
        getDocs(collection(db, `sharedVaults/${vaultId}/contributions`)),
        getDocs(collection(db, `sharedVaults/${vaultId}/expenses`)),
        getDocs(collection(db, `sharedVaults/${vaultId}/settlements`)),
        getDocs(query(collection(db, `sharedVaults/${vaultId}/activity`), limit(30))),
      ]);
      const members = membersSnap.docs.map((d) => d.data() as VaultMember);
      const contributions = contribSnap.docs.map((d) => d.data() as VaultContribution);
      const expenses = expSnap.docs.map((d) => d.data() as VaultExpense);
      const settlements = settleSnap.docs.map((d) => d.data() as VaultSettlement);
      const activities = actSnap.docs.map((d) => d.data() as VaultActivity);

      onUpdate(buildVaultSummary(vault, members, contributions, expenses, settlements, activities));
    });
  },
};
