import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Enforce test environment
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Generate an isolated temporary directory for this test process/worker
const uniqueId = `focusflow-test-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tempDir = path.resolve(os.tmpdir(), uniqueId);

// Ensure the directory exists
fs.mkdirSync(tempDir, { recursive: true });

// Assign DATA_DIR before any database module evaluation
process.env.DATA_DIR = tempDir;

// Safety assertion: Ensure DATA_DIR is strictly outside the repository data directory
const repoDataDir = path.resolve(process.cwd(), 'data');
const resolvedDataDir = path.resolve(tempDir);

if (resolvedDataDir.startsWith(repoDataDir) || resolvedDataDir === repoDataDir) {
  throw new Error(
    `[CRITICAL ISOLATION FAILURE] Resolved test DATA_DIR (${resolvedDataDir}) is inside project data directory (${repoDataDir})!`
  );
}

// Build a clean, synthetic, minimal fixture (DO NOT copy user data)
const syntheticFixture = {
  users: [
    {
      id: 'usr_atif_default',
      email: 'test_user@focusflow.local',
      name: 'Test User',
      avatarUrl: '',
      createdAt: new Date().toISOString(),
    },
  ],
  userSettings: [
    {
      userId: 'usr_atif_default',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      pomodoroWorkDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      autoSwitchSessions: false,
      soundEnabled: true,
      soundVolume: 0.8,
      theme: 'system',
      dailyFocusGoalMinutes: 120,
      weeklyFocusGoalMinutes: 600,
      monthlyBudgetPaise: 5000000,
      categoryBudgets: {},
      favoriteStyleIds: [],
      favoriteThemeIds: [],
    },
  ],
  tasks: [],
  focusSessions: [],
  categories: [
    { id: 'cat_default_food', name: 'Food & Dining', color: '#10B981', isDefault: true },
    { id: 'cat_default_bills', name: 'Bills & Utilities', color: '#EF4444', isDefault: true },
    { id: 'cat_default_transport', name: 'Transport & Travel', color: '#3B82F6', isDefault: true },
    { id: 'cat_default_shopping', name: 'Shopping', color: '#8B5CF6', isDefault: true },
    { id: 'cat_default_salary', name: 'Salary', color: '#10B981', isDefault: true },
  ],
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
};

fs.writeFileSync(
  path.join(tempDir, 'database.json'),
  JSON.stringify(syntheticFixture, null, 2),
  'utf-8'
);

// Register process exit hook to clean up the temporary directory
process.on('exit', () => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors on process termination
  }
});

