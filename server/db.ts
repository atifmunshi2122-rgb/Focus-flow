import fs from 'fs';
import path from 'path';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  getDaysInMonth,
  formatYmd,
  parseDateString,
} from './dateTime.js';

// Local JSON fallback store paths (supports DATA_DIR volume mounts for self-hosted deployments;
// primary persistence for signed-in users lives in Cloud Firestore).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'database.json');

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  timezone?: string;
  pomodoroWorkDuration: number; // in minutes
  shortBreakDuration: number;
  longBreakDuration: number;
  autoSwitchSessions: boolean;
  soundEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  themeConfig?: Record<string, unknown>;
  savedThemes?: Array<Record<string, unknown>>;
  activeSavedThemeId?: string | null;
  googleSpreadsheetId?: string;
  lastSyncedAt?: string;
  dailyFocusGoalMinutes?: number;
  weeklyFocusGoalMinutes?: number;
  monthlyBudgetPaise?: number;
  categoryBudgets?: Record<string, number>;
  dashboardLayout?: Record<string, unknown>;
  notificationPrefs?: Record<string, unknown>;
  favoriteStyleIds?: string[];
  favoriteThemeIds?: string[];
  keyboardShortcutsEnabled?: boolean;
}

export interface SubtaskItem {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'completed';
  category?: string;
  subtasks?: SubtaskItem[];
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  order?: number;
  estimatedPomodoros: number;
  completedPomodoros: number;
  dueDate: string | null;
  completedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId: string | null;
  taskTitle?: string;
  mode: 'work' | 'short_break' | 'long_break';
  durationMinutes: number;
  durationSeconds: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}

export interface ExpenseCategory {
  id: string;
  userId: string;
  name: string;
  type: 'fixed' | 'variable' | 'both';
  icon: string;
  color: string;
}

export interface RecurringExpense {
  id: string;
  userId: string;
  name: string;
  amountPaise: number; // stored in minor units (paise/cents)
  categoryId: string;
  recurrence: 'monthly' | 'quarterly' | 'yearly';
  dueDay: number; // 1 - 31
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  userId: string;
  recurringExpenseId: string | null;
  name: string;
  amountPaise: number; // stored in minor units
  categoryId: string;
  dueDate: string; // YYYY-MM-DD
  status: 'PAID' | 'UNPAID' | 'OVERDUE';
  paymentDate: string | null; // YYYY-MM-DD
  notes: string;
  periodKey: string; // e.g. "2026-11" to prevent duplicate recurring bills
  lastPaymentId?: string | null;
  lastPaymentIdempotencyKey?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentHistory {
  id: string;
  userId: string;
  billId: string;
  billName?: string;
  amountPaise: number;
  paidDate: string;
  paymentMethod: 'credit_card' | 'debit_card' | 'upi_bank' | 'cash' | 'other';
  transactionRef: string;
  idempotencyKey?: string;
  notes: string;
  status?: 'completed' | 'reversed';
  reversedAt?: string | null;
  createdAt: string;
}

export interface IncomeTransaction {
  id: string;
  userId: string;
  source: string;
  amountPaise: number;
  date: string; // YYYY-MM-DD
  category: string;
  notes: string;
  deletedAt?: string | null;
  createdAt: string;
}

export interface ExpenseTransaction {
  id: string;
  userId: string;
  billId: string | null;
  type: 'fixed' | 'variable';
  categoryId: string;
  categoryName?: string;
  amountPaise: number;
  date: string; // YYYY-MM-DD
  description: string;
  paymentMethod: 'credit_card' | 'debit_card' | 'upi_bank' | 'cash' | 'other';
  notes: string;
  deletedAt?: string | null;
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  title: string;
  targetPaise: number;
  savedPaise: number;
  targetDate: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeBlock {
  id: string;
  userId: string;
  date: string;
  title: string;
  startMinute: number;
  endMinute: number;
  category: string;
  taskId?: string | null;
  completed: boolean;
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEnvelope {
  id: string;
  userId: string;
  name: string;
  categoryId?: string | null;
  allocatedPaise: number;
  spentPaise?: number;
  monthKey: string;
  color: string;
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: string;
  userId: string;
  name: string;
  amountPaise: number;
  categoryId: string;
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  nextRenewalDate: string;
  reminderDays: number;
  autoRenew: boolean;
  status: 'active' | 'paused' | 'cancelled';
  websiteUrl?: string;
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityTitle?: string;
  details?: string;
  timestamp: string;
}

export interface DurableSyncOperation {
  id: string;
  userId: string;
  entityType: string;
  action: string;
  sheetName: string;
  payload: unknown;
  dedupeKey?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: number | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  userSettings: UserSettings[];
  tasks: Task[];
  focusSessions: FocusSession[];
  categories: ExpenseCategory[];
  recurringExpenses: RecurringExpense[];
  bills: Bill[];
  paymentHistory: PaymentHistory[];
  incomeTransactions: IncomeTransaction[];
  expenseTransactions: ExpenseTransaction[];
  savingsGoals: SavingsGoal[];
  timeBlocks: TimeBlock[];
  envelopes: BudgetEnvelope[];
  subscriptions: SubscriptionPlan[];
  auditLogs: AuditLogEntry[];
  syncQueue: DurableSyncOperation[];
}

const DEFAULT_CATEGORIES: Omit<ExpenseCategory, 'id' | 'userId'>[] = [
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

class DatabaseService {
  private db: DatabaseSchema = {
    users: [],
    userSettings: [],
    tasks: [],
    focusSessions: [],
    categories: [],
    recurringExpenses: [],
    bills: [],
    paymentHistory: [],
    incomeTransactions: [],
    expenseTransactions: [],
    savingsGoals: [],
    timeBlocks: [],
    envelopes: [],
    subscriptions: [],
    auditLogs: [],
    syncQueue: [],
  };

  private writeQueue: Promise<void> = Promise.resolve();
  private hasPendingWrite = false;

  constructor() {
    if (process.env.NODE_ENV === 'production' && !process.env.DATA_DIR) {
      console.warn(
        '[DB] Warning: DATA_DIR is not set in production; using local ./data/database.json fallback (ephemeral on container restarts unless a volume is mounted). Signed-in users persist directly in Cloud Firestore.'
      );
    }
    this.ensureDataDir();
    this.load();
    this.ensureBaseDefaults();
    if (process.env.SEED_DEFAULT_DATA === 'true') {
      this.ensureSeedData();
    }
    this.checkRecurringBills();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
        this.db = {
          users: parsed.users || [],
          userSettings: parsed.userSettings || [],
          tasks: parsed.tasks || [],
          focusSessions: parsed.focusSessions || [],
          categories: parsed.categories || [],
          recurringExpenses: parsed.recurringExpenses || [],
          bills: parsed.bills || [],
          paymentHistory: parsed.paymentHistory || [],
          incomeTransactions: parsed.incomeTransactions || [],
          expenseTransactions: parsed.expenseTransactions || [],
          savingsGoals: parsed.savingsGoals || [],
          timeBlocks: parsed.timeBlocks || [],
          envelopes: parsed.envelopes || [],
          subscriptions: parsed.subscriptions || [],
          auditLogs: parsed.auditLogs || [],
          syncQueue: parsed.syncQueue || [],
        };
      }
    } catch (err) {
      console.error('Failed to load database file, initializing empty database:', err);
    }
  }

  public save() {
    this.hasPendingWrite = true;

    this.writeQueue = this.writeQueue
      .then(async () => {
        if (!this.hasPendingWrite) return;
        this.hasPendingWrite = false;
        const snapshot = JSON.stringify(this.db, null, 2);
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        const tempPath = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.writeFile(tempPath, snapshot, 'utf-8');
        await fs.promises.rename(tempPath, DB_FILE);
      })
      .catch((err) => {
        console.error('Failed to save database file:', err);
      });
  }

  public async flush(): Promise<void> {
    await this.writeQueue;
  }

  public getRaw(): DatabaseSchema {
    return this.db;
  }

  /**
   * Ensure a user or isolated guest session has its own settings & categories workspace.
   */
  public ensureUserWorkspace(
    userId: string,
    profile?: { email?: string; name?: string; avatarUrl?: string; isGuest?: boolean }
  ): { user: User; settings: UserSettings } {

    let user = this.db.users.find((u) => u.id === userId);
    let mutated = false;

    if (!user) {
      user = {
        id: userId,
        email: profile?.email || (profile?.isGuest ? 'guest@focusflow.local' : 'user@focusflow.local'),
        name: profile?.name || (profile?.isGuest ? 'Guest Workspace' : 'Focus User'),
        avatarUrl: profile?.avatarUrl || '',
        createdAt: new Date().toISOString(),
      };
      this.db.users.push(user);
      mutated = true;
    } else if (profile && !profile.isGuest) {
      if (profile.email && user.email !== profile.email) {
        user.email = profile.email;
        mutated = true;
      }
      if (profile.name && user.name !== profile.name) {
        user.name = profile.name;
        mutated = true;
      }
      if (profile.avatarUrl !== undefined && user.avatarUrl !== profile.avatarUrl) {
        user.avatarUrl = profile.avatarUrl;
        mutated = true;
      }
    }

    let settings = this.db.userSettings.find((s) => s.userId === userId);
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
      this.db.userSettings.push(settings);
      mutated = true;
    }

    const userHasCategories = this.db.categories.some((c) => c.userId === userId);
    if (!userHasCategories) {
      const userCats: ExpenseCategory[] = DEFAULT_CATEGORIES.map((cat, idx) => ({
        id: userId === 'usr_atif_default' ? `cat_${idx + 1}` : `cat_${userId}_${idx + 1}`,
        userId,
        ...cat,
      }));
      this.db.categories.push(...userCats);
      mutated = true;
    }

    if (mutated) {
      this.save();
    }

    return { user, settings };
  }

  public getFallbackCategoryId(userId: string): string {
    const userCat = this.db.categories.find((c) => c.userId === userId || c.userId === 'system');
    if (userCat) return userCat.id;
    const { user } = this.ensureUserWorkspace(userId);
    const created = this.db.categories.find((c) => c.userId === user.id);
    return created ? created.id : 'cat_1';
  }

  public reseed(targetUserId?: string) {
    if (!targetUserId || targetUserId === 'usr_atif_default') {
      const preservedUsers = this.db.users.filter((u) => u.id !== 'usr_atif_default');
      const preservedSettings = this.db.userSettings.filter((s) => s.userId !== 'usr_atif_default');
      const preservedTasks = this.db.tasks.filter((t) => t.userId !== 'usr_atif_default');
      const preservedSessions = this.db.focusSessions.filter((s) => s.userId !== 'usr_atif_default');
      const preservedCats = this.db.categories.filter((c) => c.userId !== 'usr_atif_default');
      const preservedRec = this.db.recurringExpenses.filter((r) => r.userId !== 'usr_atif_default');
      const preservedBills = this.db.bills.filter((b) => b.userId !== 'usr_atif_default');
      const preservedHistory = this.db.paymentHistory.filter((p) => p.userId !== 'usr_atif_default');
      const preservedIncome = this.db.incomeTransactions.filter((i) => i.userId !== 'usr_atif_default');
      const preservedExp = this.db.expenseTransactions.filter((e) => e.userId !== 'usr_atif_default');
      const preservedGoals = this.db.savingsGoals.filter((g) => g.userId !== 'usr_atif_default');
      const preservedTimeBlocks = (this.db.timeBlocks || []).filter((tb) => tb.userId !== 'usr_atif_default');
      const preservedEnvelopes = (this.db.envelopes || []).filter((env) => env.userId !== 'usr_atif_default');
      const preservedSubscriptions = (this.db.subscriptions || []).filter((sub) => sub.userId !== 'usr_atif_default');
      const preservedAuditLogs = (this.db.auditLogs || []).filter((l) => l.userId !== 'usr_atif_default');
      const preservedSyncQueue = (this.db.syncQueue || []).filter((sq) => sq.userId !== 'usr_atif_default');

      this.db = {
        users: preservedUsers,
        userSettings: preservedSettings,
        tasks: preservedTasks,
        focusSessions: preservedSessions,
        categories: preservedCats,
        recurringExpenses: preservedRec,
        bills: preservedBills,
        paymentHistory: preservedHistory,
        incomeTransactions: preservedIncome,
        expenseTransactions: preservedExp,
        savingsGoals: preservedGoals,
        timeBlocks: preservedTimeBlocks,
        envelopes: preservedEnvelopes,
        subscriptions: preservedSubscriptions,
        auditLogs: preservedAuditLogs,
        syncQueue: preservedSyncQueue,
      };
      this.ensureSeedDataForUser('usr_atif_default', true);
      this.checkRecurringBills('usr_atif_default');
      this.save();
      return;
    }

    // Scoped reseed: wipe only the caller's isolated workspace and re-initialize starter state
    this.db.tasks = this.db.tasks.filter((t) => t.userId !== targetUserId);
    this.db.focusSessions = this.db.focusSessions.filter((s) => s.userId !== targetUserId);
    this.db.categories = this.db.categories.filter((c) => c.userId !== targetUserId);
    this.db.recurringExpenses = this.db.recurringExpenses.filter((r) => r.userId !== targetUserId);
    this.db.bills = this.db.bills.filter((b) => b.userId !== targetUserId);
    this.db.paymentHistory = this.db.paymentHistory.filter((p) => p.userId !== targetUserId);
    this.db.incomeTransactions = this.db.incomeTransactions.filter((i) => i.userId !== targetUserId);
    this.db.expenseTransactions = this.db.expenseTransactions.filter((e) => e.userId !== targetUserId);
    this.db.savingsGoals = this.db.savingsGoals.filter((g) => g.userId !== targetUserId);
    this.db.timeBlocks = (this.db.timeBlocks || []).filter((tb) => tb.userId !== targetUserId);
    this.db.envelopes = (this.db.envelopes || []).filter((env) => env.userId !== targetUserId);
    this.db.subscriptions = (this.db.subscriptions || []).filter((sub) => sub.userId !== targetUserId);
    this.db.auditLogs = (this.db.auditLogs || []).filter((l) => l.userId !== targetUserId);
    this.db.syncQueue = (this.db.syncQueue || []).filter((sq) => sq.userId !== targetUserId);
    this.ensureSeedDataForUser(targetUserId, false);
    this.checkRecurringBills(targetUserId);
    this.save();
  }

  public clearWorkspace(targetUserId: string, isGuest = false) {
    const isTarget = (id: string) =>
      id === targetUserId || (isGuest && (id === 'usr_atif_default' || id === 'usr_default'));
    this.db.tasks = this.db.tasks.filter((t) => !isTarget(t.userId));
    this.db.focusSessions = this.db.focusSessions.filter((s) => !isTarget(s.userId));
    this.db.recurringExpenses = this.db.recurringExpenses.filter((r) => !isTarget(r.userId));
    this.db.bills = this.db.bills.filter((b) => !isTarget(b.userId));
    this.db.paymentHistory = this.db.paymentHistory.filter((p) => !isTarget(p.userId));
    this.db.incomeTransactions = this.db.incomeTransactions.filter((i) => !isTarget(i.userId));
    this.db.expenseTransactions = this.db.expenseTransactions.filter((e) => !isTarget(e.userId));
    this.db.savingsGoals = this.db.savingsGoals.filter((g) => !isTarget(g.userId));
    this.db.timeBlocks = (this.db.timeBlocks || []).filter((tb) => !isTarget(tb.userId));
    this.db.envelopes = (this.db.envelopes || []).filter((env) => !isTarget(env.userId));
    this.db.subscriptions = (this.db.subscriptions || []).filter((sub) => !isTarget(sub.userId));
    this.save();
  }

  private ensureBaseDefaults() {
    if (!this.db.categories || this.db.categories.length === 0) {
      this.db.categories = DEFAULT_CATEGORIES.map((cat, idx) => ({
        id: `cat_${idx + 1}`,
        userId: 'usr_default',
        ...cat,
      }));
      this.save();
    }
  }

  private ensureSeedData(force = false) {
    if (this.db.users.some((u) => u.id === 'usr_atif_default') && !force) {
      return;
    }
    this.ensureSeedDataForUser('usr_atif_default', force);
  }

  private ensureSeedDataForUser(defaultUserId: string, force = false) {
    if (!force && this.db.tasks.some((t) => t.userId === defaultUserId)) {
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, '0')}`;

    // 1. User
    if (!this.db.users.some((u) => u.id === defaultUserId)) {
      const user: User = {
        id: defaultUserId,
        email: defaultUserId === 'usr_atif_default' ? 'atifmunshi2122@gmail.com' : 'guest@focusflow.local',
        name: defaultUserId === 'usr_atif_default' ? 'Atif Munshi' : 'Guest Workspace',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
      };
      this.db.users.push(user);
    }

    // 2. Settings
    if (!this.db.userSettings.some((s) => s.userId === defaultUserId)) {
      this.db.userSettings.push({
        userId: defaultUserId,
        currency: 'INR',
        pomodoroWorkDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoSwitchSessions: false,
        soundEnabled: true,
        theme: 'dark',
      });
    }

    // 3. Categories
    if (!this.db.categories.some((c) => c.userId === defaultUserId)) {
      const catPrefix = defaultUserId === 'usr_atif_default' ? 'cat' : `cat_${defaultUserId}`;
      this.db.categories.push(
        ...DEFAULT_CATEGORIES.map((cat, idx) => ({
          id: `${catPrefix}_${idx + 1}`,
          userId: defaultUserId,
          ...cat,
        }))
      );
    }

    const idSuffix = defaultUserId === 'usr_atif_default' ? '' : `_${defaultUserId}`;

    // Helper to find category id by name
    const getCatId = (name: string) => {
      const userCats = this.db.categories.filter((c) => c.userId === defaultUserId);
      const found = userCats.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
      return found ? found.id : userCats[0]?.id || 'cat_1';
    };

    // 4. Tasks
    const sampleTasks: Task[] = [
      {
        id: `tsk_1${idSuffix}`,
        userId: defaultUserId,
        title: 'Architect Personal Finance & Focus App',
        description: 'Implement full-stack relational persistence, unified dashboard, and dual-theme UI',
        priority: 'high',
        status: 'in_progress',
        estimatedPomodoros: 4,
        completedPomodoros: 3,
        dueDate: todayStr,
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `tsk_2${idSuffix}`,
        userId: defaultUserId,
        title: 'Review Monthly Budget & Recurring Bills',
        description: 'Verify quarterly subscriptions and update payment schedules',
        priority: 'medium',
        status: 'todo',
        estimatedPomodoros: 2,
        completedPomodoros: 0,
        dueDate: todayStr,
        createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `tsk_3${idSuffix}`,
        userId: defaultUserId,
        title: 'Refactor Core Database Transactions',
        description: 'Audit foreign key integrity and payment undo workflows',
        priority: 'high',
        status: 'completed',
        estimatedPomodoros: 3,
        completedPomodoros: 3,
        dueDate: todayStr,
        createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: `tsk_4${idSuffix}`,
        userId: defaultUserId,
        title: 'Deep Work: Read System Architecture Papers',
        description: 'Study state synchronization patterns and local-first offline databases',
        priority: 'low',
        status: 'todo',
        estimatedPomodoros: 2,
        completedPomodoros: 1,
        dueDate: null,
        createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.db.tasks.push(...sampleTasks);

    // 5. Focus Sessions (Last 7 days to give great weekly charts & streak)
    const sessions: FocusSession[] = [];
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const sessionDate = new Date(Date.now() - dayOffset * 24 * 3600 * 1000);
      const count = dayOffset === 0 ? 4 : Math.floor(Math.random() * 3) + 3;
      for (let s = 0; s < count; s++) {
        const start = new Date(sessionDate.getTime() + s * 45 * 60 * 1000);
        const end = new Date(start.getTime() + 25 * 60 * 1000);
        sessions.push({
          id: `foc_${dayOffset}_${s}${idSuffix}`,
          userId: defaultUserId,
          taskId: s % 2 === 0 ? `tsk_1${idSuffix}` : `tsk_3${idSuffix}`,
          taskTitle: s % 2 === 0 ? 'Architect Personal Finance & Focus App' : 'Refactor Core Database Transactions',
          mode: 'work',
          durationMinutes: 25,
          durationSeconds: 1500,
          completed: true,
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
        });
      }
    }
    this.db.focusSessions.push(...sessions);

    // 6. Recurring Expenses (Fixed)
    // All amounts in paise (100 paise = 1 INR)
    const recurring: RecurringExpense[] = [
      {
        id: `rec_1${idSuffix}`,
        userId: defaultUserId,
        name: 'Apartment Rent',
        amountPaise: 2500000, // ₹25,000.00
        categoryId: getCatId('Housing'),
        recurrence: 'monthly',
        dueDay: 5,
        isActive: true,
        notes: 'Monthly apartment lease payment via net banking',
        createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `rec_2${idSuffix}`,
        userId: defaultUserId,
        name: 'High-Speed Fiber Internet',
        amountPaise: 129900, // ₹1,299.00
        categoryId: getCatId('Internet'),
        recurrence: 'monthly',
        dueDay: 10,
        isActive: true,
        notes: '300 Mbps unlimited optical fiber connection',
        createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `rec_3${idSuffix}`,
        userId: defaultUserId,
        name: 'Premium Cloud Hosting & VPS',
        amountPaise: 240000, // ₹2,400.00
        categoryId: getCatId('Subscriptions'),
        recurrence: 'monthly',
        dueDay: 15,
        isActive: true,
        notes: 'Dedicated dev environment and staging servers',
        createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `rec_4${idSuffix}`,
        userId: defaultUserId,
        name: 'Gym & Fitness Membership',
        amountPaise: 350000, // ₹3,500.00
        categoryId: getCatId('Personal'),
        recurrence: 'monthly',
        dueDay: 20,
        isActive: true,
        notes: 'Monthly strength & wellness club pass',
        createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `rec_5${idSuffix}`,
        userId: defaultUserId,
        name: 'Health Insurance Premium',
        amountPaise: 450000, // ₹4,500.00
        categoryId: getCatId('Insurance'),
        recurrence: 'monthly',
        dueDay: 28,
        isActive: true,
        notes: 'Comprehensive medical protection',
        createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.db.recurringExpenses.push(...recurring);

    // 7. Bills for the current month
    const periodKey = `${currentYear}-${currentMonth}`;
    const bills: Bill[] = [
      {
        id: `bill_cur_1${idSuffix}`,
        userId: defaultUserId,
        recurringExpenseId: `rec_1${idSuffix}`,
        name: 'Apartment Rent',
        amountPaise: 2500000,
        categoryId: getCatId('Housing'),
        dueDate: `${currentYear}-${currentMonth}-05`,
        status: 'PAID',
        paymentDate: `${currentYear}-${currentMonth}-04`,
        notes: 'Paid via direct bank transfer',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `bill_cur_2${idSuffix}`,
        userId: defaultUserId,
        recurringExpenseId: `rec_2${idSuffix}`,
        name: 'High-Speed Fiber Internet',
        amountPaise: 129900,
        categoryId: getCatId('Internet'),
        dueDate: `${currentYear}-${currentMonth}-10`,
        status: 'PAID',
        paymentDate: `${currentYear}-${currentMonth}-09`,
        notes: 'Auto-debit confirmed',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `bill_cur_3${idSuffix}`,
        userId: defaultUserId,
        recurringExpenseId: `rec_3${idSuffix}`,
        name: 'Premium Cloud Hosting & VPS',
        amountPaise: 240000,
        categoryId: getCatId('Subscriptions'),
        dueDate: `${currentYear}-${currentMonth}-15`,
        status: 'UNPAID',
        paymentDate: null,
        notes: 'Invoice received, due mid month',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `bill_cur_4${idSuffix}`,
        userId: defaultUserId,
        recurringExpenseId: `rec_4${idSuffix}`,
        name: 'Gym & Fitness Membership',
        amountPaise: 350000,
        categoryId: getCatId('Personal'),
        dueDate: `${currentYear}-${currentMonth}-20`,
        status: 'UNPAID',
        paymentDate: null,
        notes: 'Reminder set on calendar',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `bill_cur_5${idSuffix}`,
        userId: defaultUserId,
        recurringExpenseId: `rec_5${idSuffix}`,
        name: 'Health Insurance Premium',
        amountPaise: 450000,
        categoryId: getCatId('Insurance'),
        dueDate: `${currentYear}-${currentMonth}-28`,
        status: 'UNPAID',
        paymentDate: null,
        notes: 'Annual policy renewal installment',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.db.bills.push(...bills);

    // 8. Payment History for paid bills
    this.db.paymentHistory.push(
      {
        id: `pay_hist_1${idSuffix}`,
        userId: defaultUserId,
        billId: `bill_cur_1${idSuffix}`,
        billName: 'Apartment Rent',
        amountPaise: 2500000,
        paidDate: `${currentYear}-${currentMonth}-04`,
        paymentMethod: 'upi_bank',
        transactionRef: 'UPI-RENT-849201',
        notes: 'Paid to landlord account',
        createdAt: new Date().toISOString(),
      },
      {
        id: `pay_hist_2${idSuffix}`,
        userId: defaultUserId,
        billId: `bill_cur_2${idSuffix}`,
        billName: 'High-Speed Fiber Internet',
        amountPaise: 129900,
        paidDate: `${currentYear}-${currentMonth}-09`,
        paymentMethod: 'credit_card',
        transactionRef: 'CC-NET-29831',
        notes: 'Monthly auto-bill settled',
        createdAt: new Date().toISOString(),
      }
    );

    // 9. Income Transactions
    this.db.incomeTransactions.push(
      {
        id: `inc_1${idSuffix}`,
        userId: defaultUserId,
        source: 'Engineering Salary',
        amountPaise: 14500000, // ₹145,000.00
        date: `${currentYear}-${currentMonth}-01`,
        category: 'Salary',
        notes: 'Direct salary deposit for current month',
        createdAt: new Date().toISOString(),
      },
      {
        id: `inc_2${idSuffix}`,
        userId: defaultUserId,
        source: 'Full-Stack Consulting Project',
        amountPaise: 4000000, // ₹40,000.00
        date: `${currentYear}-${currentMonth}-06`,
        category: 'Freelance',
        notes: 'Milestone 2 deliverable payment',
        createdAt: new Date().toISOString(),
      },
      {
        id: `inc_3${idSuffix}`,
        userId: defaultUserId,
        source: 'Mutual Fund Dividend',
        amountPaise: 450000, // ₹4,500.00
        date: `${currentYear}-${currentMonth}-08`,
        category: 'Investments',
        notes: 'Quarterly reinvested dividend',
        createdAt: new Date().toISOString(),
      }
    );

    // 10. Expense Transactions (Fixed paid bills + Variable expenses)
    this.db.expenseTransactions.push(
      // Paid fixed bills logged as expenses
      {
        id: `exp_fix_1${idSuffix}`,
        userId: defaultUserId,
        billId: `bill_cur_1${idSuffix}`,
        type: 'fixed',
        categoryId: getCatId('Housing'),
        amountPaise: 2500000,
        date: `${currentYear}-${currentMonth}-04`,
        description: 'Apartment Rent (Bill payment)',
        paymentMethod: 'upi_bank',
        notes: 'Auto-recorded upon bill clearance',
        createdAt: new Date().toISOString(),
      },
      {
        id: `exp_fix_2${idSuffix}`,
        userId: defaultUserId,
        billId: `bill_cur_2${idSuffix}`,
        type: 'fixed',
        categoryId: getCatId('Internet'),
        amountPaise: 129900,
        date: `${currentYear}-${currentMonth}-09`,
        description: 'High-Speed Fiber Internet (Bill payment)',
        paymentMethod: 'credit_card',
        notes: 'Auto-recorded upon bill clearance',
        createdAt: new Date().toISOString(),
      },

      // Variable Expenses
      {
        id: `exp_var_1${idSuffix}`,
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Groceries'),
        amountPaise: 425000, // ₹4,250.00
        date: `${currentYear}-${currentMonth}-03`,
        description: 'Organic Supermarket & Fresh Produce',
        paymentMethod: 'credit_card',
        notes: 'Weekly household restocking',
        createdAt: new Date().toISOString(),
      },
      {
        id: `exp_var_2${idSuffix}`,
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Food'),
        amountPaise: 185000, // ₹1,850.00
        date: `${currentYear}-${currentMonth}-05`,
        description: 'Artisan Bistro Dinner with Team',
        paymentMethod: 'upi_bank',
        notes: 'Project celebration dinner',
        createdAt: new Date().toISOString(),
      },
      {
        id: `exp_var_3${idSuffix}`,
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Transportation'),
        amountPaise: 140000, // ₹1,400.00
        date: `${currentYear}-${currentMonth}-07`,
        description: 'Fuel & Metro Travel Pass',
        paymentMethod: 'debit_card',
        notes: 'Commute expenses',
        createdAt: new Date().toISOString(),
      },
      {
        id: `exp_var_4${idSuffix}`,
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Shopping'),
        amountPaise: 380000, // ₹3,800.00
        date: `${currentYear}-${currentMonth}-08`,
        description: 'Mechanical Keyboard & Desk Ergonomics',
        paymentMethod: 'credit_card',
        notes: 'Home office workstation upgrade',
        createdAt: new Date().toISOString(),
      },
      {
        id: `exp_var_5${idSuffix}`,
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Food'),
        amountPaise: 65000, // ₹650.00
        date: `${currentYear}-${currentMonth}-10`,
        description: 'Specialty Coffee & Espresso Beans',
        paymentMethod: 'upi_bank',
        notes: 'Focus brew beans',
        createdAt: new Date().toISOString(),
      }
    );

    // 11. Savings Goals
    this.db.savingsGoals.push(
      {
        id: `sav_1${idSuffix}`,
        userId: defaultUserId,
        title: '6-Month Emergency Reserve',
        targetPaise: 60000000, // ₹6,00,000.00
        savedPaise: 32500000,  // ₹3,25,000.00
        targetDate: `${currentYear + 1}-06-30`,
        color: '#10b981',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `sav_2${idSuffix}`,
        userId: defaultUserId,
        title: 'Workstation & Studio Upgrade',
        targetPaise: 12000000, // ₹1,20,000.00
        savedPaise: 7800000,   // ₹78,000.00
        targetDate: `${currentYear}-12-31`,
        color: '#6366f1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );

    this.save();
  }

  /**
   * Automatically generate recurring bills for the current period and mark overdue bills.
   * - Respects cadence (monthly, quarterly, yearly).
   * - Computes correct month-end boundaries using days in current month.
   * - Enforces deterministic bill IDs to guarantee idempotency.
   */
  public checkRecurringBills(userId: string = 'usr_atif_default') {
    const userSettings = this.db.userSettings.find((s) => s.userId === userId);
    const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
    const todayStr = getTodayDateString(tz);
    const parsedToday = parseDateString(todayStr) || { year: 2026, month: 11, day: 12 };
    const currentYear = parsedToday.year;
    const currentMonth = parsedToday.month;
    const periodKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    let changed = false;

    // 1. Generate bills for active recurring expenses
    const recurringList = this.db.recurringExpenses.filter((r) => r.userId === userId && r.isActive !== false);

    for (const rec of recurringList) {
      // Cadence check
      if (rec.recurrence === 'quarterly') {
        const createdParsed = rec.createdAt ? parseDateString(rec.createdAt.slice(0, 10)) : null;
        const createdMonth = createdParsed ? createdParsed.month : 1;
        if (Math.abs(currentMonth - createdMonth) % 3 !== 0) {
          continue;
        }
      } else if (rec.recurrence === 'yearly') {
        const createdParsed = rec.createdAt ? parseDateString(rec.createdAt.slice(0, 10)) : null;
        const createdMonth = createdParsed ? createdParsed.month : 1;
        if (currentMonth !== createdMonth) {
          continue;
        }
      }

      const billId = `bill_${rec.id}_${periodKey}`;
      const existing = this.db.bills.find(
        (b) => b.id === billId || (b.userId === userId && b.recurringExpenseId === rec.id && b.periodKey === periodKey)
      );

      if (!existing) {
        const maxDays = getDaysInMonth(currentYear, currentMonth);
        const dueDay = Math.min(Math.max(Math.round(rec.dueDay || 1), 1), maxDays);
        const dueDate = formatYmd(currentYear, currentMonth, dueDay);
        const isPastDue = dueDate < todayStr;

        const newBill: Bill = {
          id: billId,
          userId,
          recurringExpenseId: rec.id,
          name: rec.name,
          amountPaise: rec.amountPaise,
          categoryId: rec.categoryId,
          dueDate,
          status: isPastDue ? 'OVERDUE' : 'UNPAID',
          paymentDate: null,
          notes: rec.notes || `Recurring ${rec.recurrence} expense`,
          periodKey,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.db.bills.push(newBill);
        changed = true;
      }
    }

    // 2. Mark unpaid bills past their due date as OVERDUE (skip trashed bills)
    for (const bill of this.db.bills) {
      if (!bill.deletedAt && bill.userId === userId && bill.status === 'UNPAID' && bill.dueDate < todayStr) {
        bill.status = 'OVERDUE';
        bill.updatedAt = new Date().toISOString();
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
  }

  // Transaction support: Mark bill as paid atomically & idempotently
  public markBillAsPaid(
    userId: string,
    billId: string,
    paidDate?: string,
    paymentMethod: PaymentHistory['paymentMethod'] = 'upi_bank',
    notes?: string,
    idempotencyKey?: string
  ): { success: boolean; bill?: Bill; error?: string } {
    const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
    if (!bill) {
      return { success: false, error: 'Bill not found' };
    }
    if (idempotencyKey && bill.lastPaymentIdempotencyKey === idempotencyKey && bill.status === 'PAID') {
      return { success: true, bill };
    }
    if (bill.status === 'PAID') {
      return { success: false, error: 'Bill is already marked as paid' };
    }

    const userSettings = this.db.userSettings.find((s) => s.userId === userId);
    const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
    const effectivePaidDate = paidDate || getTodayDateString(tz);
    const nowIso = new Date().toISOString();

    const paymentId = `pay_${bill.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // Atomic update
    bill.status = 'PAID';
    bill.paymentDate = effectivePaidDate;
    bill.lastPaymentId = paymentId;
    if (idempotencyKey) {
      bill.lastPaymentIdempotencyKey = idempotencyKey;
    }
    bill.updatedAt = nowIso;

    // Add to PaymentHistory (unique immutable payment record ID)
    const paymentRecord: PaymentHistory = {
      id: paymentId,
      userId,
      billId: bill.id,
      billName: bill.name,
      amountPaise: bill.amountPaise,
      paidDate: effectivePaidDate,
      paymentMethod,
      transactionRef: `REF-${bill.id}-${Date.now().toString(36).toUpperCase()}`,
      idempotencyKey,
      notes: notes || 'Bill payment recorded',
      status: 'completed',
      createdAt: nowIso,
    };
    this.db.paymentHistory.push(paymentRecord);

    // Upsert corresponding ExpenseTransaction (never push duplicate exp_bill_*)
    const existingExpense = this.db.expenseTransactions.find(
      (e) => e.id === `exp_bill_${bill.id}` && e.userId === userId
    );
    if (existingExpense) {
      existingExpense.billId = bill.id;
      existingExpense.type = 'fixed';
      existingExpense.categoryId = bill.categoryId;
      existingExpense.amountPaise = bill.amountPaise;
      existingExpense.date = effectivePaidDate;
      existingExpense.description = `${bill.name} (Bill payment)`;
      existingExpense.paymentMethod = paymentMethod;
      existingExpense.notes = notes || 'Paid bill expense';
      existingExpense.deletedAt = null;
    } else {
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
        deletedAt: null,
        createdAt: nowIso,
      };
      this.db.expenseTransactions.push(expenseTx);
    }

    // Record audit log
    this.db.auditLogs.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      action: 'pay',
      entityType: 'bill',
      entityId: bill.id,
      entityTitle: bill.name,
      details: `Paid ${bill.amountPaise} paise via ${paymentMethod}`,
      timestamp: nowIso,
    });

    this.save();
    return { success: true, bill };
  }

  public payBill(
    userId: string,
    billId: string,
    paidDate?: string,
    paymentMethod: PaymentHistory['paymentMethod'] = 'upi_bank',
    notes?: string,
    idempotencyKey?: string
  ): { success: boolean; bill?: Bill; error?: string } {
    return this.markBillAsPaid(userId, billId, paidDate, paymentMethod, notes, idempotencyKey);
  }

  // Safe undo payment: preserve historical payment record with 'reversed' status
  public undoBillPayment(userId: string, billId: string): { success: boolean; bill?: Bill; error?: string } {
    const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
    if (!bill) {
      return { success: false, error: 'Bill not found' };
    }
    if (bill.status !== 'PAID') {
      return { success: false, error: 'Bill is not marked as paid' };
    }

    const userSettings = this.db.userSettings.find((s) => s.userId === userId);
    const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
    const todayStr = getTodayDateString(tz);
    const nowIso = new Date().toISOString();

    bill.status = bill.dueDate < todayStr ? 'OVERDUE' : 'UNPAID';
    bill.paymentDate = null;
    bill.updatedAt = nowIso;

    // Preserve payment history by marking status reversed instead of hard-deleting
    for (const p of this.db.paymentHistory) {
      if (p.userId === userId && p.billId === billId && p.status !== 'reversed') {
        p.status = 'reversed';
        p.reversedAt = nowIso;
      }
    }

    // Soft-delete corresponding expense transaction
    for (const e of this.db.expenseTransactions) {
      if (e.userId === userId && e.billId === billId && !e.deletedAt) {
        e.deletedAt = nowIso;
      }
    }

    // Record audit log
    this.db.auditLogs.push({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      action: 'undo_payment',
      entityType: 'bill',
      entityId: bill.id,
      entityTitle: bill.name,
      details: `Reversed payment for bill ${bill.name}`,
      timestamp: nowIso,
    });

    this.save();
    return { success: true, bill };
  }

  // --- TIME BLOCKS ---
  public getTimeBlocks(userId: string, date?: string): TimeBlock[] {
    this.db.timeBlocks = this.db.timeBlocks || [];
    return this.db.timeBlocks
      .filter((tb) => tb.userId === userId && !tb.deletedAt && (!date || tb.date === date))
      .sort((a, b) => a.startMinute - b.startMinute);
  }

  public saveTimeBlock(userId: string, input: Partial<TimeBlock>): TimeBlock {
    this.db.timeBlocks = this.db.timeBlocks || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `tb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const idx = this.db.timeBlocks.findIndex((tb) => tb.id === id && tb.userId === userId);

    const block: TimeBlock = {
      id,
      userId,
      date: input.date || getTodayDateString(DEFAULT_TIMEZONE),
      title: (input.title || 'Focus Block').trim(),
      startMinute: Math.max(0, Math.min(1440, Number(input.startMinute) || 0)),
      endMinute: Math.max(0, Math.min(1440, Number(input.endMinute) || 60)),
      category: input.category || 'Focus',
      taskId: input.taskId || null,
      completed: Boolean(input.completed),
      notes: input.notes || '',
      deletedAt: input.deletedAt || null,
      createdAt: idx >= 0 ? this.db.timeBlocks[idx].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (idx >= 0) {
      this.db.timeBlocks[idx] = block;
    } else {
      this.db.timeBlocks.push(block);
    }
    this.save();
    return block;
  }

  public deleteTimeBlock(userId: string, id: string, isGuest = false): boolean {
    this.db.timeBlocks = this.db.timeBlocks || [];
    const isTarget = (uid: string) => uid === userId || (isGuest && (uid === 'usr_atif_default' || uid === 'usr_default'));
    const block = this.db.timeBlocks.find((tb) => tb.id === id && isTarget(tb.userId));
    if (!block) return false;
    block.deletedAt = new Date().toISOString();
    block.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // --- ENVELOPE BUDGETING ---
  public getEnvelopes(userId: string, monthKey?: string): BudgetEnvelope[] {
    this.db.envelopes = this.db.envelopes || [];
    const currentMonthKey = monthKey || getTodayDateString(DEFAULT_TIMEZONE).slice(0, 7);
    
    // Compute actual spent paise from expenses in this month for matching category
    return this.db.envelopes
      .filter((env) => env.userId === userId && !env.deletedAt && (!monthKey || env.monthKey === currentMonthKey))
      .map((env) => {
        let spent = 0;
        if (env.categoryId) {
          spent = this.db.expenseTransactions
            .filter((e) => e.userId === userId && !e.deletedAt && e.categoryId === env.categoryId && e.date.startsWith(env.monthKey))
            .reduce((sum, e) => sum + (e.amountPaise || 0), 0);
        }
        return {
          ...env,
          spentPaise: spent,
        };
      });
  }

  public saveEnvelope(userId: string, input: Partial<BudgetEnvelope>): BudgetEnvelope {
    this.db.envelopes = this.db.envelopes || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const idx = this.db.envelopes.findIndex((env) => env.id === id && env.userId === userId);

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
      createdAt: idx >= 0 ? this.db.envelopes[idx].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (idx >= 0) {
      this.db.envelopes[idx] = env;
    } else {
      this.db.envelopes.push(env);
    }
    this.save();
    return env;
  }

  public transferEnvelopeFunds(
    userId: string,
    fromId: string,
    toId: string,
    amountPaise: number
  ): { success: boolean; error?: string } {
    this.db.envelopes = this.db.envelopes || [];
    const fromEnv = this.db.envelopes.find((e) => e.id === fromId && e.userId === userId && !e.deletedAt);
    const toEnv = this.db.envelopes.find((e) => e.id === toId && e.userId === userId && !e.deletedAt);
    if (!fromEnv || !toEnv) return { success: false, error: 'Envelope not found' };
    if (amountPaise <= 0) return { success: false, error: 'Transfer amount must be positive' };
    if (fromEnv.allocatedPaise < amountPaise) {
      return { success: false, error: 'Source envelope has insufficient funds' };
    }

    const nowIso = new Date().toISOString();
    fromEnv.allocatedPaise -= amountPaise;
    fromEnv.updatedAt = nowIso;
    toEnv.allocatedPaise += amountPaise;
    toEnv.updatedAt = nowIso;

    this.recordAuditLog(userId, {
      action: 'envelope_transfer',
      entityType: 'envelope',
      entityId: fromId,
      entityTitle: `${fromEnv.name} -> ${toEnv.name}`,
      details: `Transferred ${amountPaise} paise from ${fromEnv.name} to ${toEnv.name}`,
    });

    this.save();
    return { success: true };
  }

  public deleteEnvelope(userId: string, id: string, isGuest = false): boolean {
    this.db.envelopes = this.db.envelopes || [];
    const isTarget = (uid: string) => uid === userId || (isGuest && (uid === 'usr_atif_default' || uid === 'usr_default'));
    const env = this.db.envelopes.find((e) => e.id === id && isTarget(e.userId));
    if (!env) return false;
    env.deletedAt = new Date().toISOString();
    env.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // --- SUBSCRIPTIONS ---
  public getSubscriptions(userId: string): SubscriptionPlan[] {
    this.db.subscriptions = this.db.subscriptions || [];
    return this.db.subscriptions
      .filter((s) => s.userId === userId && !s.deletedAt)
      .sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate));
  }

  public saveSubscription(userId: string, input: Partial<SubscriptionPlan>): SubscriptionPlan {
    this.db.subscriptions = this.db.subscriptions || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const idx = this.db.subscriptions.findIndex((s) => s.id === id && s.userId === userId);

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
      createdAt: idx >= 0 ? this.db.subscriptions[idx].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (idx >= 0) {
      this.db.subscriptions[idx] = sub;
    } else {
      this.db.subscriptions.push(sub);
    }
    this.save();
    return sub;
  }

  public deleteSubscription(userId: string, id: string, isGuest = false): boolean {
    this.db.subscriptions = this.db.subscriptions || [];
    const isTarget = (uid: string) => uid === userId || (isGuest && (uid === 'usr_atif_default' || uid === 'usr_default'));
    const sub = this.db.subscriptions.find((s) => s.id === id && isTarget(s.userId));
    if (!sub) return false;
    sub.deletedAt = new Date().toISOString();
    sub.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // --- AUDIT LOGS ---
  public getAuditLogs(userId: string, limit = 100): AuditLogEntry[] {
    this.db.auditLogs = this.db.auditLogs || [];
    return this.db.auditLogs
      .filter((l) => l.userId === userId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  public recordAuditLog(
    userId: string,
    entry: Omit<AuditLogEntry, 'id' | 'userId' | 'timestamp'> & { timestamp?: string }
  ): AuditLogEntry {
    this.db.auditLogs = this.db.auditLogs || [];
    const log: AuditLogEntry = {
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityTitle: entry.entityTitle || '',
      details: entry.details || '',
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    this.db.auditLogs.push(log);
    if (this.db.auditLogs.length > 2000) {
      this.db.auditLogs = this.db.auditLogs.slice(-1500);
    }
    this.save();
    return log;
  }

  // --- DURABLE SYNC QUEUE ---
  public getSyncQueue(userId: string): DurableSyncOperation[] {
    this.db.syncQueue = this.db.syncQueue || [];
    return this.db.syncQueue.filter((sq) => sq.userId === userId && sq.status !== 'completed');
  }

  public enqueueSync(
    userId: string,
    op: Omit<DurableSyncOperation, 'id' | 'userId' | 'status' | 'attempts' | 'createdAt'>
  ): DurableSyncOperation {
    this.db.syncQueue = this.db.syncQueue || [];
    const dedupeKey = typeof op.dedupeKey === 'string' && op.dedupeKey.trim() ? op.dedupeKey.trim() : undefined;

    if (dedupeKey) {
      const existing = this.db.syncQueue.find(
        (sq) => sq.userId === userId && sq.dedupeKey === dedupeKey && sq.status !== 'completed'
      );
      if (existing) {
        existing.payload = op.payload;
        existing.action = op.action;
        existing.entityType = op.entityType;
        existing.sheetName = op.sheetName;
        existing.status = 'pending';
        existing.nextRetryAt = null;
        existing.errorMessage = null;
        this.save();
        return existing;
      }
    }

    const item: DurableSyncOperation = {
      id: `sync_op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      entityType: op.entityType,
      action: op.action,
      sheetName: op.sheetName,
      payload: op.payload,
      dedupeKey,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.db.syncQueue.push(item);
    this.save();
    return item;
  }

  public updateSyncOp(
    userId: string,
    id: string,
    updates: Partial<DurableSyncOperation>
  ): DurableSyncOperation | null {
    this.db.syncQueue = this.db.syncQueue || [];
    const item = this.db.syncQueue.find((sq) => sq.id === id && sq.userId === userId);
    if (!item) return null;
    Object.assign(item, updates);
    this.save();
    return item;
  }

  // --- DATA RECOVERY & BACKUPS ---
  public exportUserData(userId: string): Record<string, unknown> {
    const backup = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      userId,
      userSettings: this.db.userSettings.find((s) => s.userId === userId) || null,
      tasks: this.db.tasks.filter((t) => t.userId === userId),
      focusSessions: this.db.focusSessions.filter((s) => s.userId === userId),
      categories: this.db.categories.filter((c) => c.userId === userId),
      recurringExpenses: this.db.recurringExpenses.filter((r) => r.userId === userId),
      bills: this.db.bills.filter((b) => b.userId === userId),
      paymentHistory: this.db.paymentHistory.filter((p) => p.userId === userId),
      incomeTransactions: this.db.incomeTransactions.filter((i) => i.userId === userId),
      expenseTransactions: this.db.expenseTransactions.filter((e) => e.userId === userId),
      savingsGoals: this.db.savingsGoals.filter((g) => g.userId === userId),
      timeBlocks: (this.db.timeBlocks || []).filter((tb) => tb.userId === userId),
      envelopes: (this.db.envelopes || []).filter((env) => env.userId === userId),
      subscriptions: (this.db.subscriptions || []).filter((sub) => sub.userId === userId),
      auditLogs: (this.db.auditLogs || []).filter((l) => l.userId === userId),
    };
    return backup;
  }

  public restoreUserData(
    userId: string,
    data: any
  ): { success: boolean; counts: Record<string, number>; errors?: string[] } {
    if (!data || typeof data !== 'object') {
      return { success: false, counts: {}, errors: ['Invalid backup JSON structure'] };
    }

    const counts: Record<string, number> = {};
    const nowIso = new Date().toISOString();

    if (Array.isArray(data.tasks)) {
      this.db.tasks = this.db.tasks.filter((t) => t.userId !== userId);
      for (const item of data.tasks) {
        if (item && item.id && item.title) {
          this.db.tasks.push({ ...item, userId });
        }
      }
      counts.tasks = this.db.tasks.filter((t) => t.userId === userId).length;
    }

    if (Array.isArray(data.incomeTransactions)) {
      this.db.incomeTransactions = this.db.incomeTransactions.filter((i) => i.userId !== userId);
      for (const item of data.incomeTransactions) {
        if (item && item.id && item.source) {
          this.db.incomeTransactions.push({ ...item, userId });
        }
      }
      counts.incomeTransactions = this.db.incomeTransactions.filter((i) => i.userId === userId).length;
    }

    if (Array.isArray(data.expenseTransactions)) {
      this.db.expenseTransactions = this.db.expenseTransactions.filter((e) => e.userId !== userId);
      for (const item of data.expenseTransactions) {
        if (item && item.id && item.amountPaise !== undefined) {
          this.db.expenseTransactions.push({ ...item, userId });
        }
      }
      counts.expenseTransactions = this.db.expenseTransactions.filter((e) => e.userId === userId).length;
    }

    if (Array.isArray(data.bills)) {
      this.db.bills = this.db.bills.filter((b) => b.userId !== userId);
      for (const item of data.bills) {
        if (item && item.id && item.name) {
          this.db.bills.push({ ...item, userId });
        }
      }
      counts.bills = this.db.bills.filter((b) => b.userId === userId).length;
    }

    if (Array.isArray(data.paymentHistory)) {
      this.db.paymentHistory = this.db.paymentHistory.filter((p) => p.userId !== userId);
      for (const item of data.paymentHistory) {
        if (item && item.id && item.billId) {
          this.db.paymentHistory.push({ ...item, userId });
        }
      }
      counts.paymentHistory = this.db.paymentHistory.filter((p) => p.userId === userId).length;
    }

    if (Array.isArray(data.timeBlocks)) {
      this.db.timeBlocks = (this.db.timeBlocks || []).filter((tb) => tb.userId !== userId);
      for (const item of data.timeBlocks) {
        if (item && item.id && item.title) {
          this.db.timeBlocks.push({ ...item, userId });
        }
      }
      counts.timeBlocks = this.db.timeBlocks.filter((tb) => tb.userId === userId).length;
    }

    if (Array.isArray(data.envelopes)) {
      this.db.envelopes = (this.db.envelopes || []).filter((env) => env.userId !== userId);
      for (const item of data.envelopes) {
        if (item && item.id && item.name) {
          this.db.envelopes.push({ ...item, userId });
        }
      }
      counts.envelopes = this.db.envelopes.filter((env) => env.userId === userId).length;
    }

    if (Array.isArray(data.subscriptions)) {
      this.db.subscriptions = (this.db.subscriptions || []).filter((sub) => sub.userId !== userId);
      for (const item of data.subscriptions) {
        if (item && item.id && item.name) {
          this.db.subscriptions.push({ ...item, userId });
        }
      }
      counts.subscriptions = this.db.subscriptions.filter((sub) => sub.userId === userId).length;
    }

    this.recordAuditLog(userId, {
      action: 'backup_restore',
      entityType: 'backup',
      entityId: `rst_${Date.now()}`,
      entityTitle: 'Data Recovery Restore',
      details: `Restored records: ${JSON.stringify(counts)}`,
    });

    this.save();
    return { success: true, counts };
  }
}

export const dbService = new DatabaseService();
