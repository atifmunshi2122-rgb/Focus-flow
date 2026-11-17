import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  getDaysInMonth,
  formatYmd,
  parseDateString,
} from './dateTime.js';
import type {
  JointVault,
  VaultMember,
  VaultInvitation,
  VaultContribution,
  VaultExpense,
  VaultSettlement,
  VaultActivity,
  VaultSummary,
} from '../src/types/vault.ts';
import {
  isValidRatio,
  allocateTargetPaise,
  computeMemberContributionStats,
  computeVaultSettlement,
  splitExpense,
  computeMilestones,
  buildVaultSummary,
} from '../src/lib/vaultIntelligence.ts';
import { formatCurrency } from '../src/lib/currency.ts';

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
  soundVolume?: number;
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
  taskTitle?: string | null;
  subjectCode?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  activityType?: 'study' | 'practice' | 'theory' | 'revision' | null;
  mode: 'work' | 'short_break' | 'long_break';
  presetId?: string | null;
  durationMinutes: number;
  durationSeconds: number;
  actualDurationSeconds?: number;
  completed: boolean;
  status?: 'in_progress' | 'completed' | 'interrupted';
  interrupted?: boolean;
  pauseCount?: number;
  totalPauseSeconds?: number;
  interruptionReason?: string;
  startedAt: string;
  endedAt: string | null;
  endReason?: 'completed' | 'reset' | 'skipped' | 'abandoned' | null;
  createdAt?: string;
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
  revisionId?: string | null;
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

export interface AcademicTier {
  id: string;
  userId?: string;
  name: string;
  shortTitle: string;
  description: string;
  subjectCodes?: string[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface StudySubject {
  id: string;
  userId: string;
  code: string;
  name: string;
  tierId: string;
  semesterOrDomain?: string;
  targetExam?: string;
  totalSubtopics: number;
  completedSubtopics: number;
  color?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface StudyTopic {
  id: string;
  userId: string;
  subjectCode: string;
  unit: string;
  topic: string;
  subtopic: string;
  priority: 'High' | 'Medium' | 'Low';
  theory: boolean;
  practice: boolean;
  pyq: boolean;
  revisionCount: number;
  notes?: string;
  rowIndex?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface StudyRevision {
  id: string;
  userId: string;
  topicId: string;
  subjectCode: string;
  topicTitle: string;
  lastStudiedAt: string;
  nextRevisionAt: string;
  intervalDays: number;
  repetition: number;
  difficulty: 'easy' | 'medium' | 'hard';
  recallScore?: number;
  status: 'scheduled' | 'due' | 'overdue' | 'mastered';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface StudyMistake {
  id: string;
  userId: string;
  date: string;
  subjectCode: string;
  subjectName?: string;
  topic: string;
  source: string;
  severity: 'High' | 'Medium' | 'Low';
  trap: string;
  rootCause: string;
  goldenRule: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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
  studyTiers?: AcademicTier[];
  studySubjects?: StudySubject[];
  studyTopics?: StudyTopic[];
  studyRevisions?: StudyRevision[];
  studyMistakes?: StudyMistake[];
  jointVaults?: JointVault[];
  vaultMembers?: VaultMember[];
  vaultInvitations?: VaultInvitation[];
  vaultContributions?: VaultContribution[];
  vaultExpenses?: VaultExpense[];
  vaultSettlements?: VaultSettlement[];
  vaultActivities?: VaultActivity[];
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

export class DatabaseCorruptError extends Error {
  public readonly dbPath: string;
  constructor(message: string, dbPath: string, cause?: unknown) {
    super(message);
    this.name = 'DatabaseCorruptError';
    this.dbPath = dbPath;
    if (cause) {
      this.cause = cause;
    }
  }
}

export class PersistenceDegradedError extends Error {
  public readonly dbPath: string;
  constructor(message: string, dbPath: string, cause?: unknown) {
    super(message);
    this.name = 'PersistenceDegradedError';
    this.dbPath = dbPath;
    if (cause) {
      this.cause = cause;
    }
  }
}

export class DatabaseService {
  private dataDir: string;
  private dbFile: string;

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
    studySubjects: [],
    studyTopics: [],
    studyRevisions: [],
    studyMistakes: [],
    jointVaults: [],
    vaultMembers: [],
    vaultInvitations: [],
    vaultContributions: [],
    vaultExpenses: [],
    vaultSettlements: [],
    vaultActivities: [],
  };

  private writeQueue: Promise<void> = Promise.resolve();
  private pendingWrites: Promise<void>[] = [];
  private tempCounter = 0;
  private isCorrupted = false;
  private corruptionError: DatabaseCorruptError | null = null;
  private isPersistenceDegraded = false;
  private persistenceError: Error | null = null;

  constructor(customDataDir?: string) {
    this.dataDir = customDataDir
      ? path.resolve(customDataDir)
      : (process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data'));
    this.dbFile = path.resolve(this.dataDir, 'database.json');

    if (process.env.NODE_ENV === 'production' && !process.env.DATA_DIR && !customDataDir) {
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
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    } else {
      // Clean up orphaned .tmp files from previous unexpected process crashes
      try {
        const files = fs.readdirSync(this.dataDir);
        for (const f of files) {
          if (f.startsWith('.database.') && f.endsWith('.tmp')) {
            try {
              fs.unlinkSync(path.resolve(this.dataDir, f));
            } catch {
              // Ignore cleanup error of individual file
            }
          }
        }
      } catch {
        // Ignore directory read error
      }
    }
  }

  private load() {
    if (!fs.existsSync(this.dbFile)) {
      // Missing database file is a valid clean workspace state; start with fresh schema
      return;
    }

    const raw = fs.readFileSync(this.dbFile, 'utf-8');
    if (raw.trim().length === 0) {
      this.isCorrupted = true;
      this.corruptionError = new DatabaseCorruptError(
        `Database file at ${this.dbFile} is empty/truncated and cannot be parsed as JSON.`,
        this.dbFile
      );
      throw this.corruptionError;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Database JSON root must be an object');
      }
      this.db = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        userSettings: Array.isArray(parsed.userSettings) ? parsed.userSettings : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        focusSessions: Array.isArray(parsed.focusSessions) ? parsed.focusSessions : [],
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        recurringExpenses: Array.isArray(parsed.recurringExpenses) ? parsed.recurringExpenses : [],
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        paymentHistory: Array.isArray(parsed.paymentHistory) ? parsed.paymentHistory : [],
        incomeTransactions: Array.isArray(parsed.incomeTransactions) ? parsed.incomeTransactions : [],
        expenseTransactions: Array.isArray(parsed.expenseTransactions) ? parsed.expenseTransactions : [],
        savingsGoals: Array.isArray(parsed.savingsGoals) ? parsed.savingsGoals : [],
        timeBlocks: Array.isArray(parsed.timeBlocks) ? parsed.timeBlocks : [],
        envelopes: Array.isArray(parsed.envelopes) ? parsed.envelopes : [],
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        syncQueue: Array.isArray(parsed.syncQueue) ? parsed.syncQueue : [],
        studySubjects: Array.isArray(parsed.studySubjects) ? parsed.studySubjects : [],
        studyTopics: Array.isArray(parsed.studyTopics) ? parsed.studyTopics : [],
        studyRevisions: Array.isArray(parsed.studyRevisions) ? parsed.studyRevisions : [],
        studyMistakes: Array.isArray(parsed.studyMistakes) ? parsed.studyMistakes : [],
        jointVaults: Array.isArray(parsed.jointVaults) ? parsed.jointVaults : [],
        vaultMembers: Array.isArray(parsed.vaultMembers) ? parsed.vaultMembers : [],
        vaultInvitations: Array.isArray(parsed.vaultInvitations) ? parsed.vaultInvitations : [],
        vaultContributions: Array.isArray(parsed.vaultContributions) ? parsed.vaultContributions : [],
        vaultExpenses: Array.isArray(parsed.vaultExpenses) ? parsed.vaultExpenses : [],
        vaultSettlements: Array.isArray(parsed.vaultSettlements) ? parsed.vaultSettlements : [],
        vaultActivities: Array.isArray(parsed.vaultActivities) ? parsed.vaultActivities : [],
      };
    } catch (err) {
      this.isCorrupted = true;
      const causeMsg = err instanceof Error ? err.message : String(err);
      this.corruptionError = new DatabaseCorruptError(
        `Database file at ${this.dbFile} is corrupted and cannot be parsed: ${causeMsg}`,
        this.dbFile,
        err
      );
      throw this.corruptionError;
    }
  }

  public isHealthy(): boolean {
    return !this.isCorrupted && !this.isPersistenceDegraded;
  }

  public isDegraded(): boolean {
    return this.isPersistenceDegraded;
  }

  public getCorruptionError(): DatabaseCorruptError | null {
    return this.corruptionError;
  }

  public getPersistenceError(): Error | null {
    return this.persistenceError;
  }

  public getDatabasePath(): string {
    return this.dbFile;
  }

  public resetPersistenceHealth(): void {
    this.isPersistenceDegraded = false;
    this.persistenceError = null;
  }

  public async recoverPersistence(): Promise<void> {
    this.resetPersistenceHealth();
    await this.save();
  }

  public save(): Promise<void> {
    if (this.isCorrupted) {
      const err = new DatabaseCorruptError(
        `Database at ${this.dbFile} is corrupted. Refusing write operation to protect original data.`,
        this.dbFile
      );
      const rejected = Promise.reject(err);
      rejected.catch(() => {});
      return rejected;
    }

    if (this.isPersistenceDegraded) {
      const err = new PersistenceDegradedError(
        `Database at ${this.dbFile} is in a degraded read-only state due to earlier write failure: ${this.persistenceError?.message || ''}`,
        this.dbFile,
        this.persistenceError
      );
      const rejected = Promise.reject(err);
      rejected.catch(() => {});
      return rejected;
    }

    const snapshot = JSON.stringify(this.db, null, 2);

    const currentWrite = async () => {
      if (this.isPersistenceDegraded) {
        throw new PersistenceDegradedError(
          `Database at ${this.dbFile} is in a degraded read-only state due to earlier write failure: ${this.persistenceError?.message || ''}`,
          this.dbFile,
          this.persistenceError
        );
      }
      const counter = ++this.tempCounter;
      const tempPath = path.resolve(
        this.dataDir,
        `.database.${process.pid}.${Date.now()}.${counter}.tmp`
      );

      try {
        await fs.promises.mkdir(this.dataDir, { recursive: true });
        await fs.promises.writeFile(tempPath, snapshot, {
          encoding: 'utf-8',
          mode: 0o600,
        });
        await fs.promises.rename(tempPath, this.dbFile);
      } catch (err) {
        this.isPersistenceDegraded = true;
        this.persistenceError = err instanceof Error ? err : new Error(String(err));
        try {
          if (fs.existsSync(tempPath)) {
            await fs.promises.unlink(tempPath);
          }
        } catch {
          // Ignore temp cleanup error
        }
        throw err;
      }
    };

    const previousQueue = this.writeQueue;
    let opResolve!: () => void;
    let opReject!: (err: unknown) => void;
    const writePromise = new Promise<void>((resolve, reject) => {
      opResolve = resolve;
      opReject = reject;
    });

    this.pendingWrites.push(writePromise);
    const cleanup = () => {
      const idx = this.pendingWrites.indexOf(writePromise);
      if (idx >= 0) {
        this.pendingWrites.splice(idx, 1);
      }
    };
    writePromise.then(cleanup, () => { cleanup(); });

    this.writeQueue = (async () => {
      try {
        await previousQueue;
      } catch {
        // Do not poison the queue execution sequence on previous write failure
      }
      try {
        await currentWrite();
        opResolve();
      } catch (err) {
        opReject(err);
      }
    })();

    return writePromise;
  }

  public async flush(): Promise<void> {
    while (this.pendingWrites.length > 0) {
      if (this.isPersistenceDegraded && this.persistenceError) {
        throw this.persistenceError;
      }
      const batch = [...this.pendingWrites];
      await Promise.all(batch);
    }
    if (this.isPersistenceDegraded && this.persistenceError) {
      throw this.persistenceError;
    }
  }

  public getRaw(): DatabaseSchema {
    if (this.isCorrupted) {
      throw new DatabaseCorruptError(
        `Database at ${this.dbFile} is corrupted. Refusing read operation to protect integrity.`,
        this.dbFile
      );
    }
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
    this.db.studySubjects = (this.db.studySubjects || []).filter((s) => s.userId !== targetUserId);
    this.db.studyTopics = (this.db.studyTopics || []).filter((t) => t.userId !== targetUserId);
    this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => r.userId !== targetUserId);
    this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => m.userId !== targetUserId);
    this.db.auditLogs = (this.db.auditLogs || []).filter((l) => l.userId !== targetUserId);
    this.db.syncQueue = (this.db.syncQueue || []).filter((sq) => sq.userId !== targetUserId);
    this.ensureSeedDataForUser(targetUserId, false);
    this.checkRecurringBills(targetUserId);
    this.save();
  }

  public clearWorkspace(targetUserId: string) {
    const isTarget = (id: string) => id === targetUserId;
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
    this.db.studySubjects = (this.db.studySubjects || []).filter((s) => !isTarget(s.userId));
    this.db.studyTopics = (this.db.studyTopics || []).filter((t) => !isTarget(t.userId));
    this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => !isTarget(r.userId));
    this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => !isTarget(m.userId));
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
    const existing = idx >= 0 ? this.db.timeBlocks[idx] : undefined;

    const rawStart = input.startMinute !== undefined ? Number(input.startMinute) : Number(existing?.startMinute ?? 0);
    const startMinute = Math.max(0, Math.min(1439, Number.isFinite(rawStart) ? Math.round(rawStart) : 0));
    const rawEnd = input.endMinute !== undefined ? Number(input.endMinute) : Number(existing?.endMinute ?? 60);
    const endMinute = Math.max(startMinute + 1, Math.min(1440, Number.isFinite(rawEnd) ? Math.round(rawEnd) : startMinute + 60));

    const block: TimeBlock = {
      id,
      userId,
      date: input.date ?? existing?.date ?? getTodayDateString(DEFAULT_TIMEZONE),
      title: (input.title ?? existing?.title ?? 'Focus Block').trim() || 'Focus Block',
      startMinute,
      endMinute,
      category: input.category ?? existing?.category ?? 'Focus',
      taskId: input.taskId !== undefined ? input.taskId : (existing?.taskId ?? null),
      revisionId: input.revisionId !== undefined ? input.revisionId : (existing?.revisionId ?? null),
      completed: input.completed !== undefined ? Boolean(input.completed) : Boolean(existing?.completed),
      notes: input.notes !== undefined ? input.notes : (existing?.notes ?? ''),
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing?.deletedAt ?? null),
      createdAt: existing ? existing.createdAt : nowIso,
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

  public deleteTimeBlock(userId: string, id: string): boolean {
    this.db.timeBlocks = this.db.timeBlocks || [];
    const block = this.db.timeBlocks.find((tb) => tb.id === id && tb.userId === userId);
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

  public deleteEnvelope(userId: string, id: string): boolean {
    this.db.envelopes = this.db.envelopes || [];
    const env = this.db.envelopes.find((e) => e.id === id && e.userId === userId);
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

  public deleteSubscription(userId: string, id: string): boolean {
    this.db.subscriptions = this.db.subscriptions || [];
    const sub = this.db.subscriptions.find((s) => s.id === id && s.userId === userId);
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
      studySubjects: (this.db.studySubjects || []).filter((s) => s.userId === userId),
      studyTopics: (this.db.studyTopics || []).filter((t) => t.userId === userId),
      studyRevisions: (this.db.studyRevisions || []).filter((r) => r.userId === userId),
      studyMistakes: (this.db.studyMistakes || []).filter((m) => m.userId === userId),
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

    if (Array.isArray(data.studySubjects)) {
      this.db.studySubjects = (this.db.studySubjects || []).filter((s) => s.userId !== userId);
      for (const item of data.studySubjects) {
        if (item && item.id && item.code) {
          this.db.studySubjects.push({ ...item, userId });
        }
      }
      counts.studySubjects = this.db.studySubjects.filter((s) => s.userId === userId).length;
    }

    if (Array.isArray(data.studyTopics)) {
      this.db.studyTopics = (this.db.studyTopics || []).filter((t) => t.userId !== userId);
      for (const item of data.studyTopics) {
        if (item && item.id && item.subjectCode) {
          this.db.studyTopics.push({ ...item, userId });
        }
      }
      counts.studyTopics = this.db.studyTopics.filter((t) => t.userId === userId).length;
    }

    if (Array.isArray(data.studyRevisions)) {
      this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => r.userId !== userId);
      for (const item of data.studyRevisions) {
        if (item && item.id && item.topicId) {
          this.db.studyRevisions.push({ ...item, userId });
        }
      }
      counts.studyRevisions = this.db.studyRevisions.filter((r) => r.userId === userId).length;
    }

    if (Array.isArray(data.studyMistakes)) {
      this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => m.userId !== userId);
      for (const item of data.studyMistakes) {
        if (item && item.id && item.trap) {
          this.db.studyMistakes.push({ ...item, userId });
        }
      }
      counts.studyMistakes = this.db.studyMistakes.filter((m) => m.userId === userId).length;
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

  // --- STUDY MANAGEMENT CRUD METHODS ---
  public clearStudyData(userId: string): void {
    this.db.studySubjects = (this.db.studySubjects || []).filter((s) => s.userId !== userId);
    this.db.studyTopics = (this.db.studyTopics || []).filter((t) => t.userId !== userId);
    this.db.studyRevisions = (this.db.studyRevisions || []).filter((r) => r.userId !== userId);
    this.db.studyMistakes = (this.db.studyMistakes || []).filter((m) => m.userId !== userId);
    this.save();
  }

  public getStudyTiers(userId: string): AcademicTier[] {
    const list = this.db.studyTiers || [];
    return list.filter((t) => (!t.userId || t.userId === userId) && !t.deletedAt);
  }

  public saveStudyTier(userId: string, input: Partial<AcademicTier>): AcademicTier {
    this.db.studyTiers = this.db.studyTiers || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `tier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existingIdx = this.db.studyTiers.findIndex((t) => t.id === id);
    const tier: AcademicTier = {
      id: existingIdx >= 0 ? this.db.studyTiers[existingIdx].id : id,
      userId,
      name: (input.name || 'Academic Tier').trim(),
      shortTitle: (input.shortTitle || input.name || 'Tier').trim(),
      description: (input.description || '').trim(),
      subjectCodes: input.subjectCodes || [],
      createdAt: existingIdx >= 0 ? this.db.studyTiers[existingIdx].createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt || null,
    };
    if (existingIdx >= 0) {
      this.db.studyTiers[existingIdx] = tier;
    } else {
      this.db.studyTiers.push(tier);
    }
    this.save();
    return tier;
  }

  public deleteStudyTier(userId: string, id: string): boolean {
    this.db.studyTiers = this.db.studyTiers || [];
    const idx = this.db.studyTiers.findIndex((t) => t.id === id && t.userId === userId);
    if (idx === -1) return false;
    this.db.studyTiers[idx].deletedAt = new Date().toISOString();
    this.save();
    return true;
  }

  public getStudySubjects(userId: string): StudySubject[] {
    const list = this.db.studySubjects || [];
    return list.filter((s) => s.userId === userId && !s.deletedAt);
  }

  public saveStudySubject(userId: string, input: Partial<StudySubject>): StudySubject {
    this.db.studySubjects = this.db.studySubjects || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `subj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const code = (input.code || `SUB_${Date.now().toString(36).toUpperCase()}`).trim();

    const existingIdx = this.db.studySubjects.findIndex((s) => s.userId === userId && (s.id === id || s.code === code));
    const subject: StudySubject = {
      id: existingIdx >= 0 ? this.db.studySubjects[existingIdx].id : id,
      userId,
      code,
      name: (input.name || 'Subject').trim(),
      tierId: input.tierId || 'tier1_sem3',
      semesterOrDomain: input.semesterOrDomain || '',
      targetExam: input.targetExam || '',
      totalSubtopics: Number(input.totalSubtopics) || 0,
      completedSubtopics: Number(input.completedSubtopics) || 0,
      color: input.color || '#3b82f6',
      createdAt: existingIdx >= 0 ? this.db.studySubjects[existingIdx].createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt || null,
    };

    if (existingIdx >= 0) {
      this.db.studySubjects[existingIdx] = subject;
    } else {
      this.db.studySubjects.push(subject);
    }
    this.save();
    return subject;
  }

  public deleteStudySubject(
    userId: string,
    codeOrId: string
  ): { success: boolean; deletedCount: number; subjectCode?: string } {
    this.db.studySubjects = this.db.studySubjects || [];
    this.db.studyTopics = this.db.studyTopics || [];

    const targetSub = this.db.studySubjects.find(
      (s) =>
        s.userId === userId &&
        !s.deletedAt &&
        (s.id === codeOrId || s.code === codeOrId || s.code.toLowerCase() === codeOrId.toLowerCase())
    );
    if (!targetSub) {
      return { success: false, deletedCount: 0 };
    }

    const previousSubjects = JSON.parse(JSON.stringify(this.db.studySubjects)) as StudySubject[];
    const previousTopics = JSON.parse(JSON.stringify(this.db.studyTopics)) as StudyTopic[];

    try {
      const nowIso = new Date().toISOString();
      targetSub.deletedAt = nowIso;
      targetSub.updatedAt = nowIso;

      const matchingTopics = this.db.studyTopics.filter(
        (t) => t.userId === userId && !t.deletedAt && t.subjectCode === targetSub.code
      );
      for (const t of matchingTopics) {
        t.deletedAt = nowIso;
        t.updatedAt = nowIso;
      }

      this.save();
      return {
        success: true,
        deletedCount: 1 + matchingTopics.length,
        subjectCode: targetSub.code,
      };
    } catch (err) {
      // Transaction rollback in case save fails
      this.db.studySubjects = previousSubjects;
      this.db.studyTopics = previousTopics;
      throw err;
    }
  }

  public getStudyTopics(userId: string, subjectCode?: string): StudyTopic[] {
    const list = this.db.studyTopics || [];
    return list
      .filter((t) => t.userId === userId && !t.deletedAt && (!subjectCode || t.subjectCode === subjectCode))
      .sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
  }

  public saveStudyTopic(userId: string, input: Partial<StudyTopic>): StudyTopic {
    this.db.studyTopics = this.db.studyTopics || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const existingIdx = this.db.studyTopics.findIndex((t) => t.userId === userId && t.id === id);
    const existing = existingIdx >= 0 ? this.db.studyTopics[existingIdx] : undefined;
    const topic: StudyTopic = {
      id,
      userId,
      subjectCode: existing?.subjectCode ?? input.subjectCode ?? 'Sub_General',
      unit: input.unit ?? existing?.unit ?? 'Unit 1',
      topic: input.topic ?? existing?.topic ?? 'General Topic',
      subtopic: input.subtopic ?? existing?.subtopic ?? 'Core Concept',
      priority: input.priority ?? existing?.priority ?? 'Medium',
      theory: input.theory !== undefined ? Boolean(input.theory) : Boolean(existing?.theory),
      practice: input.practice !== undefined ? Boolean(input.practice) : Boolean(existing?.practice),
      pyq: input.pyq !== undefined ? Boolean(input.pyq) : Boolean(existing?.pyq),
      revisionCount: Number(input.revisionCount ?? existing?.revisionCount ?? 0) || 0,
      notes: input.notes !== undefined ? input.notes : (existing?.notes ?? ''),
      rowIndex: input.rowIndex !== undefined ? input.rowIndex : (existing?.rowIndex ?? 0),
      createdAt: existing ? existing.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (existing?.deletedAt ?? null),
    };

    if (existingIdx >= 0) {
      this.db.studyTopics[existingIdx] = topic;
    } else {
      this.db.studyTopics.push(topic);
    }

    this.recomputeSubjectCounts(userId, topic.subjectCode);
    this.save();
    return topic;
  }

  private recomputeSubjectCounts(userId: string, subjectCode: string): void {
    const topics = (this.db.studyTopics || []).filter((t) => t.userId === userId && t.subjectCode === subjectCode && !t.deletedAt);
    const completed = topics.filter((t) => t.theory && t.practice).length;
    const subIdx = (this.db.studySubjects || []).findIndex((s) => s.userId === userId && s.code === subjectCode);
    if (subIdx >= 0 && this.db.studySubjects) {
      this.db.studySubjects[subIdx].totalSubtopics = topics.length;
      this.db.studySubjects[subIdx].completedSubtopics = completed;
      this.db.studySubjects[subIdx].updatedAt = new Date().toISOString();
    }
  }

  public deleteStudyTopic(userId: string, topicId: string): boolean {
    this.db.studyTopics = this.db.studyTopics || [];
    const idx = this.db.studyTopics.findIndex((t) => t.userId === userId && t.id === topicId);
    if (idx === -1) return false;

    const subjectCode = this.db.studyTopics[idx].subjectCode;
    this.db.studyTopics[idx].deletedAt = new Date().toISOString();
    this.recomputeSubjectCounts(userId, subjectCode);
    this.save();
    return true;
  }

  public getStudyRevisions(userId: string): StudyRevision[] {
    const list = this.db.studyRevisions || [];
    return list.filter((r) => r.userId === userId && !r.deletedAt);
  }

  public saveStudyRevision(userId: string, input: Partial<StudyRevision>): StudyRevision {
    this.db.studyRevisions = this.db.studyRevisions || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const existingIdx = this.db.studyRevisions.findIndex((r) => r.userId === userId && r.id === id);
    const revision: StudyRevision = {
      id,
      userId,
      topicId: input.topicId || '',
      subjectCode: input.subjectCode || 'Sub_General',
      topicTitle: input.topicTitle || 'Revision Topic',
      lastStudiedAt: input.lastStudiedAt || nowIso.slice(0, 10),
      nextRevisionAt: input.nextRevisionAt || nowIso.slice(0, 10),
      intervalDays: Number(input.intervalDays) || 1,
      repetition: Number(input.repetition) || 1,
      difficulty: input.difficulty || 'medium',
      recallScore: input.recallScore,
      status: input.status || 'scheduled',
      notes: input.notes || '',
      createdAt: existingIdx >= 0 ? this.db.studyRevisions[existingIdx].createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt || null,
    };

    if (existingIdx >= 0) {
      this.db.studyRevisions[existingIdx] = revision;
    } else {
      this.db.studyRevisions.push(revision);
    }
    this.save();
    return revision;
  }

  public recordStudyRecall(userId: string, revisionId: string, difficulty: 'easy' | 'medium' | 'hard'): StudyRevision | null {
    this.db.studyRevisions = this.db.studyRevisions || [];
    const idx = this.db.studyRevisions.findIndex((r) => r.userId === userId && r.id === revisionId);
    if (idx === -1) return null;

    const rev = this.db.studyRevisions[idx];
    const todayStr = new Date().toISOString().slice(0, 10);
    const ladder = [1, 3, 7, 14, 30, 60];
    const currentIdx = ladder.indexOf(rev.intervalDays);

    let nextInterval: number;
    let nextStatus: StudyRevision['status'] = 'scheduled';

    if (difficulty === 'hard') {
      const newIdx = Math.max(0, (currentIdx >= 0 ? currentIdx : 0) - 1);
      nextInterval = ladder[newIdx];
    } else if (difficulty === 'easy') {
      const newIdx = Math.min(ladder.length - 1, (currentIdx >= 0 ? currentIdx : 0) + 2);
      nextInterval = ladder[newIdx];
      if (newIdx >= ladder.length - 1) nextStatus = 'mastered';
    } else {
      const newIdx = (currentIdx >= 0 ? currentIdx : 0) + 1;
      if (newIdx >= ladder.length - 1) {
        nextInterval = ladder[ladder.length - 1];
        nextStatus = 'mastered';
      } else {
        nextInterval = ladder[newIdx];
      }
    }

    const nextDate = new Date(`${todayStr}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + nextInterval);
    const nextRevisionAt = nextDate.toISOString().slice(0, 10);

    const updated: StudyRevision = {
      ...rev,
      lastStudiedAt: todayStr,
      nextRevisionAt,
      intervalDays: nextInterval,
      repetition: rev.repetition + 1,
      difficulty,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    this.db.studyRevisions[idx] = updated;
    this.save();
    return updated;
  }

  public deleteStudyRevision(userId: string, revisionId: string): boolean {
    this.db.studyRevisions = this.db.studyRevisions || [];
    const idx = this.db.studyRevisions.findIndex((r) => r.userId === userId && r.id === revisionId);
    if (idx === -1) return false;

    this.db.studyRevisions[idx].deletedAt = new Date().toISOString();
    this.save();
    return true;
  }

  public getStudyMistakes(userId: string): StudyMistake[] {
    const list = this.db.studyMistakes || [];
    return list.filter((m) => m.userId === userId && !m.deletedAt);
  }

  public saveStudyMistake(userId: string, input: Partial<StudyMistake>): StudyMistake {
    this.db.studyMistakes = this.db.studyMistakes || [];
    const nowIso = new Date().toISOString();
    const id = input.id || `mistake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const existingIdx = this.db.studyMistakes.findIndex((m) => m.userId === userId && m.id === id);
    const mistake: StudyMistake = {
      id,
      userId,
      date: input.date || nowIso.slice(0, 10),
      subjectCode: input.subjectCode || 'Sub_General',
      subjectName: input.subjectName || input.subjectCode || 'General',
      topic: input.topic || 'General Topic',
      source: input.source || 'Practice',
      severity: input.severity || 'Medium',
      trap: input.trap || '',
      rootCause: input.rootCause || '',
      goldenRule: input.goldenRule || '',
      resolved: Boolean(input.resolved),
      createdAt: existingIdx >= 0 ? this.db.studyMistakes[existingIdx].createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: input.deletedAt || null,
    };

    if (existingIdx >= 0) {
      this.db.studyMistakes[existingIdx] = mistake;
    } else {
      this.db.studyMistakes.push(mistake);
    }
    this.save();
    return mistake;
  }

  public deleteStudyMistake(userId: string, mistakeId: string): boolean {
    this.db.studyMistakes = this.db.studyMistakes || [];
    const idx = this.db.studyMistakes.findIndex((m) => m.userId === userId && m.id === mistakeId);
    if (idx === -1) return false;

    this.db.studyMistakes[idx].deletedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // ==========================================
  // JOINT VAULTS (COUPLE SHARED SAVINGS)
  // ==========================================

  private ensureJointVaultsArrays(): void {
    if (!this.db.jointVaults) this.db.jointVaults = [];
    if (!this.db.vaultMembers) this.db.vaultMembers = [];
    if (!this.db.vaultInvitations) this.db.vaultInvitations = [];
    if (!this.db.vaultContributions) this.db.vaultContributions = [];
    if (!this.db.vaultExpenses) this.db.vaultExpenses = [];
    if (!this.db.vaultSettlements) this.db.vaultSettlements = [];
    if (!this.db.vaultActivities) this.db.vaultActivities = [];
  }

  public createJointVault(
    data: {
      name: string;
      description?: string;
      targetPaise: number;
      monthlyTargetPaise?: number;
      currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
      targetRatio?: Record<string, number>;
    },
    creatorUser: { id: string; email?: string; name?: string }
  ): JointVault {
    this.ensureJointVaultsArrays();
    const nowIso = new Date().toISOString();
    const vaultId = `vlt_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2, 8)}`;
    const currency = data.currency || 'INR';

    const vault: JointVault = {
      id: vaultId,
      name: data.name.trim(),
      description: (data.description || '').trim(),
      currency,
      targetPaise: data.targetPaise,
      monthlyTargetPaise: data.monthlyTargetPaise || Math.round(data.targetPaise / 10),
      createdBy: creatorUser.id,
      memberUids: [creatorUser.id],
      targetRatio: data.targetRatio && isValidRatio(data.targetRatio, [creatorUser.id]) ? data.targetRatio : { [creatorUser.id]: 100 },
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const creatorMember: VaultMember = {
      uid: creatorUser.id,
      email: creatorUser.email || `${creatorUser.id}@focusflow.app`,
      name: creatorUser.name || 'Vault Creator',
      role: 'creator',
      status: 'active',
      joinedAt: nowIso,
    };

    const activity: VaultActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: creatorUser.id,
      actorName: creatorMember.name,
      type: 'vault_created',
      title: 'Joint Vault Created',
      description: `${creatorMember.name} created the vault "${vault.name}"`,
      timestamp: nowIso,
    };

    this.db.jointVaults!.push(vault);
    this.db.vaultMembers!.push(creatorMember);
    this.db.vaultActivities!.push(activity);
    this.save();
    return vault;
  }

  public getJointVaultsForUser(userId: string): VaultSummary[] {
    this.ensureJointVaultsArrays();
    const userVaults = (this.db.jointVaults || []).filter(
      (v) => v.memberUids.includes(userId)
    );
    return userVaults
      .map((vault) => this.getVaultSummary(vault.id, userId))
      .filter((v): v is VaultSummary => v !== null);
  }

  public getVaultSummary(vaultId: string, userId: string): VaultSummary | null {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault) return null;
    // Strict membership check: user MUST be an active member!
    if (!vault.memberUids.includes(userId)) return null;

    const members = (this.db.vaultMembers || []).filter(
      (m) => m.status === 'active' && vault.memberUids.includes(m.uid)
    );
    const contributions = (this.db.vaultContributions || []).filter((c) => c.vaultId === vaultId);
    const expenses = (this.db.vaultExpenses || []).filter((e) => e.vaultId === vaultId);
    const settlements = (this.db.vaultSettlements || []).filter((s) => s.vaultId === vaultId);
    const activities = (this.db.vaultActivities || []).filter((a) => a.vaultId === vaultId);

    return buildVaultSummary(vault, members, contributions, expenses, settlements, activities);
  }

  public getVault(vaultId: string, userId: string): JointVault | null {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault || !vault.memberUids.includes(userId)) return null;
    return vault;
  }

  public createVaultInvitation(
    vaultId: string,
    inviterUser: { id: string; name?: string },
    invitedEmail?: string
  ): VaultInvitation {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault) throw new Error('Vault not found');
    if (!vault.memberUids.includes(inviterUser.id)) throw new Error('Unauthorized: only vault members can invite');
    if (vault.memberUids.length >= 2) throw new Error('Vault already has maximum members (2)');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inviteCode = crypto.randomBytes(6).toString('hex').toUpperCase();

    const invitation: VaultInvitation = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      vaultName: vault.name,
      invitedByUid: inviterUser.id,
      invitedByName: inviterUser.name || 'Vault Partner',
      inviteCode,
      invitedEmail: invitedEmail ? invitedEmail.trim() : undefined,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
    };

    this.db.vaultInvitations!.push(invitation);
    this.save();
    return invitation;
  }

  public acceptVaultInvitation(
    inviteCode: string,
    user: { id: string; email?: string; name?: string }
  ): { vault: JointVault; invitation: VaultInvitation } {
    this.ensureJointVaultsArrays();
    const code = inviteCode.trim().toUpperCase();
    const invitation = (this.db.vaultInvitations || []).find(
      (inv) => inv.inviteCode === code && inv.status === 'pending'
    );
    if (!invitation) throw new Error('Invalid or already processed invitation code');

    if (new Date(invitation.expiresAt) <= new Date()) {
      invitation.status = 'expired';
      this.save();
      throw new Error('Invitation has expired');
    }

    const vault = (this.db.jointVaults || []).find((v) => v.id === invitation.vaultId);
    if (!vault || vault.status !== 'active') throw new Error('Target vault not found or archived');

    if (vault.memberUids.includes(user.id)) {
      throw new Error('You are already a member of this vault');
    }
    if (vault.memberUids.length >= 2) {
      throw new Error('Vault already has the maximum of 2 active members');
    }

    const nowIso = new Date().toISOString();
    invitation.status = 'accepted';
    invitation.acceptedByUid = user.id;
    invitation.acceptedAt = nowIso;

    vault.memberUids.push(user.id);
    // Initialize 50/50 couple target ratio
    vault.targetRatio = {
      [vault.createdBy]: 50,
      [user.id]: 50,
    };
    vault.updatedAt = nowIso;

    const newMember: VaultMember = {
      uid: user.id,
      email: user.email || `${user.id}@focusflow.app`,
      name: user.name || 'Partner',
      role: 'partner',
      status: 'active',
      joinedAt: nowIso,
    };
    this.db.vaultMembers!.push(newMember);

    const activity: VaultActivity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId: vault.id,
      actorUid: user.id,
      actorName: newMember.name,
      type: 'member_joined',
      title: 'Partner Joined Vault',
      description: `${newMember.name} joined "${vault.name}"`,
      timestamp: nowIso,
    };
    this.db.vaultActivities!.push(activity);

    this.save();
    return { vault, invitation };
  }

  public rejectVaultInvitation(inviteCode: string, userId: string): VaultInvitation {
    this.ensureJointVaultsArrays();
    const code = inviteCode.trim().toUpperCase();
    const invitation = (this.db.vaultInvitations || []).find(
      (inv) => inv.inviteCode === code && inv.status === 'pending'
    );
    if (!invitation) throw new Error('Invalid or already processed invitation');
    invitation.status = 'rejected';
    this.save();
    return invitation;
  }

  public revokeVaultInvitation(vaultId: string, inviteId: string, userId: string): boolean {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault || !vault.memberUids.includes(userId)) return false;
    const invitation = (this.db.vaultInvitations || []).find(
      (inv) => inv.id === inviteId && inv.vaultId === vaultId
    );
    if (!invitation || invitation.status !== 'pending') return false;
    invitation.status = 'revoked';
    this.save();
    return true;
  }

  public addVaultContribution(
    vaultId: string,
    user: { id: string; name?: string },
    data: { amountPaise: number; date?: string; description?: string }
  ): VaultContribution {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault) throw new Error('Vault not found');
    if (!vault.memberUids.includes(user.id)) throw new Error('Unauthorized: only vault members can contribute');
    if (vault.status !== 'active') throw new Error('Cannot contribute to an archived vault');

    if (!data.amountPaise || !Number.isInteger(data.amountPaise) || data.amountPaise <= 0) {
      throw new Error('Contribution amount must be a positive integer in paise');
    }

    const nowIso = new Date().toISOString();
    const contribution: VaultContribution = {
      id: `vcb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      contributedByUid: user.id,
      contributorName: user.name || 'Member',
      amountPaise: data.amountPaise,
      date: data.date || nowIso.slice(0, 10),
      description: (data.description || 'Shared savings contribution').trim(),
      createdAt: nowIso,
      status: 'active',
    };

    this.db.vaultContributions!.push(contribution);

    const activeContribs = (this.db.vaultContributions || []).filter(
      (c) => c.vaultId === vaultId && c.status === 'active'
    );
    const totalContributed = activeContribs.reduce((acc, c) => acc + c.amountPaise, 0);

    // Milestone checks (25%, 50%, 75%, 100%)
    for (const pct of [25, 50, 75, 100] as const) {
      const milestoneTarget = Math.floor((vault.targetPaise * pct) / 100);
      const alreadyLogged = (this.db.vaultActivities || []).some(
        (a) =>
          a.vaultId === vaultId &&
          a.type === 'milestone_achieved' &&
          (a.metadata as { percent?: number } | undefined)?.percent === pct
      );
      if (!alreadyLogged && totalContributed >= milestoneTarget) {
        this.db.vaultActivities!.push({
          id: `act_milestone_${vaultId}_${pct}_${Date.now()}`,
          vaultId,
          actorUid: user.id,
          actorName: user.name || 'Member',
          type: 'milestone_achieved',
          title: `${pct}% Milestone Reached!`,
          description: `The vault "${vault.name}" reached ${pct}% of its savings goal!`,
          amountPaise: totalContributed,
          timestamp: nowIso,
          metadata: { percent: pct, targetPaise: milestoneTarget },
        });
      }
    }

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: user.id,
      actorName: user.name || 'Member',
      type: 'contribution_added',
      title: 'Contribution Added',
      description: `${user.name || 'Member'} contributed ${formatCurrency(contribution.amountPaise, vault.currency)}`,
      amountPaise: contribution.amountPaise,
      timestamp: nowIso,
    });

    vault.updatedAt = nowIso;
    this.save();
    return contribution;
  }

  public reverseVaultContribution(
    vaultId: string,
    contributionId: string,
    userId: string,
    reason: string
  ): VaultContribution {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault || !vault.memberUids.includes(userId)) throw new Error('Unauthorized');

    const contribution = (this.db.vaultContributions || []).find(
      (c) => c.id === contributionId && c.vaultId === vaultId
    );
    if (!contribution) throw new Error('Contribution not found');
    if (contribution.status !== 'active') throw new Error('Contribution is already reversed');

    const nowIso = new Date().toISOString();
    contribution.status = 'reversed';
    contribution.reversedAt = nowIso;
    contribution.reversedByUid = userId;
    contribution.reversalReason = reason ? reason.trim() : 'Manual reversal';

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: userId,
      actorName: 'Member',
      type: 'contribution_reversed',
      title: 'Contribution Reversed',
      description: `Contribution of ${formatCurrency(contribution.amountPaise, vault.currency)} was reversed: ${contribution.reversalReason}`,
      amountPaise: contribution.amountPaise,
      timestamp: nowIso,
    });

    vault.updatedAt = nowIso;
    this.save();
    return contribution;
  }

  public addVaultExpense(
    vaultId: string,
    user: { id: string; name?: string },
    data: {
      amountPaise: number;
      description: string;
      date?: string;
      splitMode?: 'equal' | 'ratio' | 'custom';
      customShares?: Record<string, number>;
    }
  ): VaultExpense {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault) throw new Error('Vault not found');
    if (!vault.memberUids.includes(user.id)) throw new Error('Unauthorized');
    if (vault.memberUids.length < 2) throw new Error('Joint expenses require 2 active members');

    if (!data.amountPaise || !Number.isInteger(data.amountPaise) || data.amountPaise <= 0) {
      throw new Error('Expense amount must be a positive integer in paise');
    }

    const uidA = vault.memberUids[0];
    const uidB = vault.memberUids[1];
    const ratioA = vault.targetRatio[uidA] ?? 50;
    const splitMode = data.splitMode || 'equal';
    const memberShares = splitExpense(data.amountPaise, splitMode, uidA, uidB, ratioA, data.customShares);

    const nowIso = new Date().toISOString();
    const expense: VaultExpense = {
      id: `vex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      paidByUid: user.id,
      payerName: user.name || 'Member',
      amountPaise: data.amountPaise,
      description: data.description.trim(),
      date: data.date || nowIso.slice(0, 10),
      splitMode,
      memberShares,
      createdAt: nowIso,
      status: 'active',
    };

    this.db.vaultExpenses!.push(expense);

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: user.id,
      actorName: user.name || 'Member',
      type: 'expense_added',
      title: 'Joint Expense Recorded',
      description: `${user.name || 'Member'} paid ${formatCurrency(expense.amountPaise, vault.currency)} for "${expense.description}"`,
      amountPaise: expense.amountPaise,
      timestamp: nowIso,
    });

    vault.updatedAt = nowIso;
    this.save();
    return expense;
  }

  public reverseVaultExpense(vaultId: string, expenseId: string, userId: string): VaultExpense {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault || !vault.memberUids.includes(userId)) throw new Error('Unauthorized');

    const expense = (this.db.vaultExpenses || []).find((e) => e.id === expenseId && e.vaultId === vaultId);
    if (!expense) throw new Error('Expense not found');
    if (expense.status !== 'active') throw new Error('Expense is already reversed');

    const nowIso = new Date().toISOString();
    expense.status = 'reversed';
    expense.reversedAt = nowIso;
    expense.reversedByUid = userId;

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: userId,
      actorName: 'Member',
      type: 'expense_reversed',
      title: 'Joint Expense Reversed',
      description: `Expense "${expense.description}" of ${formatCurrency(expense.amountPaise, vault.currency)} was reversed`,
      amountPaise: expense.amountPaise,
      timestamp: nowIso,
    });

    vault.updatedAt = nowIso;
    this.save();
    return expense;
  }

  public recordVaultSettlement(
    vaultId: string,
    fromUser: { id: string; name?: string },
    data: { toUid: string; toName?: string; amountPaise: number; date?: string; notes?: string }
  ): VaultSettlement {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault) throw new Error('Vault not found');
    if (!vault.memberUids.includes(fromUser.id)) throw new Error('Unauthorized');
    if (!vault.memberUids.includes(data.toUid)) throw new Error('Recipient must be a vault member');

    if (!data.amountPaise || !Number.isInteger(data.amountPaise) || data.amountPaise <= 0) {
      throw new Error('Settlement amount must be a positive integer in paise');
    }

    const nowIso = new Date().toISOString();
    const settlement: VaultSettlement = {
      id: `vstl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      fromUid: fromUser.id,
      fromName: fromUser.name || 'Member',
      toUid: data.toUid,
      toName: data.toName || 'Partner',
      amountPaise: data.amountPaise,
      date: data.date || nowIso.slice(0, 10),
      notes: (data.notes || 'Settlement payment').trim(),
      createdAt: nowIso,
    };

    this.db.vaultSettlements!.push(settlement);

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: fromUser.id,
      actorName: fromUser.name || 'Member',
      type: 'settlement_recorded',
      title: 'Settlement Payment Recorded',
      description: `${settlement.fromName} paid ${formatCurrency(settlement.amountPaise, vault.currency)} to ${settlement.toName}`,
      amountPaise: settlement.amountPaise,
      timestamp: nowIso,
    });

    vault.updatedAt = nowIso;
    this.save();
    return settlement;
  }

  public updateVaultRatio(
    vaultId: string,
    userId: string,
    targetRatio: Record<string, number>
  ): JointVault {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault || !vault.memberUids.includes(userId)) throw new Error('Unauthorized');
    if (!isValidRatio(targetRatio, vault.memberUids)) {
      throw new Error('Invalid target ratio: must be positive integers summing to 100 for all vault members');
    }

    vault.targetRatio = targetRatio;
    vault.updatedAt = new Date().toISOString();

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: userId,
      actorName: 'Member',
      type: 'ratio_updated',
      title: 'Contribution Ratio Updated',
      description: `Target ratio updated to ${Object.values(targetRatio).join('/')}`,
      timestamp: vault.updatedAt,
    });

    this.save();
    return vault;
  }

  public leaveVault(vaultId: string, userId: string): boolean {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault || !vault.memberUids.includes(userId)) return false;

    if (vault.memberUids.length <= 1) {
      throw new Error('Single remaining member cannot leave vault. Please archive the vault instead.');
    }

    const member = (this.db.vaultMembers || []).find((m) => m.uid === userId);
    if (member) {
      member.status = 'left';
    }

    vault.memberUids = vault.memberUids.filter((id) => id !== userId);
    vault.updatedAt = new Date().toISOString();

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: userId,
      actorName: member?.name || 'Partner',
      type: 'member_left',
      title: 'Member Left Vault',
      description: `${member?.name || 'A member'} left the vault`,
      timestamp: vault.updatedAt,
    });

    this.save();
    return true;
  }

  public archiveVault(vaultId: string, userId: string): JointVault {
    this.ensureJointVaultsArrays();
    const vault = (this.db.jointVaults || []).find((v) => v.id === vaultId);
    if (!vault || !vault.memberUids.includes(userId)) throw new Error('Unauthorized');

    vault.status = 'archived';
    vault.updatedAt = new Date().toISOString();

    this.db.vaultActivities!.push({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vaultId,
      actorUid: userId,
      actorName: 'Member',
      type: 'vault_archived',
      title: 'Vault Archived',
      description: `The vault "${vault.name}" was archived`,
      timestamp: vault.updatedAt,
    });

    this.save();
    return vault;
  }
}

export const dbService = new DatabaseService();
