import fs from 'fs';
import path from 'path';

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
  notes: string;
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
  };

  private writeQueue: Promise<void> = Promise.resolve();
  private saveScheduled = false;

  constructor() {
    if (process.env.NODE_ENV === 'production' && !process.env.DATA_DIR) {
      console.warn(
        '[DB] Warning: DATA_DIR is not set in production; using local ./data/database.json fallback (ephemeral on container restarts unless a volume is mounted). Signed-in users persist directly in Cloud Firestore.'
      );
    }
    this.ensureDataDir();
    this.load();
    this.ensureSeedData();
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
        };
      }
    } catch (err) {
      console.error('Failed to load database file, initializing empty database:', err);
    }
  }

  public save() {
    if (this.saveScheduled) return;
    this.saveScheduled = true;
    const snapshot = JSON.stringify(this.db, null, 2);

    this.writeQueue = this.writeQueue
      .then(async () => {
        this.saveScheduled = false;
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        const tempPath = `${DB_FILE}.${process.pid}.tmp`;
        await fs.promises.writeFile(tempPath, snapshot, 'utf-8');
        await fs.promises.rename(tempPath, DB_FILE);
      })
      .catch((err) => {
        this.saveScheduled = false;
        console.error('Failed to save database file:', err);
      });
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
    if (userId === 'usr_atif_default') {
      this.ensureSeedData(false);
    } else if (profile?.isGuest && !this.db.users.some((u) => u.id === userId)) {
      this.ensureSeedDataForUser(userId, false);
    }

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
    this.ensureSeedDataForUser(targetUserId, false);
    this.checkRecurringBills(targetUserId);
    this.save();
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
   */
  public checkRecurringBills(userId: string = 'usr_atif_default') {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, '0')}`;
    const periodKey = `${currentYear}-${currentMonth}`;
    let changed = false;

    // 1. Generate bills for active recurring expenses
    const recurringList = this.db.recurringExpenses.filter((r) => r.userId === userId && r.isActive);

    for (const rec of recurringList) {
      const existing = this.db.bills.find(
        (b) => b.userId === userId && b.recurringExpenseId === rec.id && b.periodKey === periodKey
      );

      if (!existing) {
        const clampedDay = Number.isFinite(rec.dueDay) ? Math.min(Math.max(Math.round(rec.dueDay), 1), 28) : 1;
        const dueDayStr = String(clampedDay).padStart(2, '0');
        const dueDate = `${currentYear}-${currentMonth}-${dueDayStr}`;
        const isPastDue = dueDate < todayStr;

        const newBill: Bill = {
          id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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

  // Transaction support: Mark bill as paid
  public markBillAsPaid(
    userId: string,
    billId: string,
    paidDate?: string,
    paymentMethod: PaymentHistory['paymentMethod'] = 'upi_bank',
    notes?: string
  ): { success: boolean; bill?: Bill; error?: string } {
    const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
    if (!bill) {
      return { success: false, error: 'Bill not found' };
    }
    if (bill.status === 'PAID') {
      return { success: false, error: 'Bill is already paid' };
    }

    const effectivePaidDate = paidDate || new Date().toISOString().split('T')[0];

    // Atomic update
    bill.status = 'PAID';
    bill.paymentDate = effectivePaidDate;
    bill.updatedAt = new Date().toISOString();

    // Add to PaymentHistory
    const paymentRecord: PaymentHistory = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
    this.db.paymentHistory.push(paymentRecord);

    // Create corresponding ExpenseTransaction so it reflects in expenses
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
    this.db.expenseTransactions.push(expenseTx);

    this.save();
    return { success: true, bill };
  }

  // Undo payment: revert bill back to unpaid
  public undoBillPayment(userId: string, billId: string): { success: boolean; bill?: Bill; error?: string } {
    const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
    if (!bill) {
      return { success: false, error: 'Bill not found' };
    }
    if (bill.status !== 'PAID') {
      return { success: false, error: 'Bill is not marked as paid' };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    bill.status = bill.dueDate < todayStr ? 'OVERDUE' : 'UNPAID';
    bill.paymentDate = null;
    bill.updatedAt = new Date().toISOString();

    // Remove linked payment record
    this.db.paymentHistory = this.db.paymentHistory.filter((p) => !(p.userId === userId && p.billId === billId));

    // Remove linked expense transaction
    this.db.expenseTransactions = this.db.expenseTransactions.filter(
      (e) => !(e.userId === userId && e.billId === billId)
    );

    this.save();
    return { success: true, bill };
  }
}

export const dbService = new DatabaseService();
