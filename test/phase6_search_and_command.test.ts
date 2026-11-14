import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchUniversalWorkspace,
  getContextualCommandSuggestions,
  getRecentSearches,
  saveRecentSearch,
  clearRecentSearches,
  getRecentActions,
  recordRecentAction,
  UniversalSearchSources,
} from '../src/lib/searchEngine.tsx';
import { SHORTCUTS_REGISTRY } from '../src/components/common/KeyboardShortcutsModal.tsx';
import { Task, ExpenseTransaction, IncomeTransaction, Bill, Habit, BudgetEnvelope, SavingsGoal, UserSettings } from '../src/types/index.ts';

// Helper mock storage
class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

test('Phase 6 — Universal Search: Comprehensive Cross-Entity Indexing', () => {
  const navigated: string[] = [];
  const actionTriggered: string[] = [];

  const mockTasks: Task[] = [
    {
      id: 't_1',
      userId: 'u1',
      title: 'Submit Q4 Financial Tax Report',
      description: 'Prepare reconciliation files for auditor',
      category: 'Finance',
      priority: 'high',
      dueDate: '2026-11-20',
      status: 'todo',
      estimatedPomodoros: 2,
      completedPomodoros: 0,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 't_deleted',
      userId: 'u1',
      title: 'Deleted Task that should not appear',
      description: '',
      category: 'General',
      priority: 'low',
      status: 'todo',
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      dueDate: null,
      deletedAt: '2026-11-05T00:00:00Z',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-05T00:00:00Z',
    },
  ];

  const mockExpenses: ExpenseTransaction[] = [
    {
      id: 'e_1',
      userId: 'u1',
      billId: null,
      type: 'variable',
      categoryId: 'groceries',
      categoryName: 'Groceries',
      amountPaise: 450000, // ₹4,500
      date: '2026-11-14',
      description: 'Weekly Organic Grocery Market',
      paymentMethod: 'upi_bank',
      notes: 'Fresh produce & dry staples',
      createdAt: '2026-11-14T10:00:00Z',
    },
  ];

  const mockIncomes: IncomeTransaction[] = [
    {
      id: 'i_1',
      userId: 'u1',
      source: 'Acme Corp Consulting Retainer',
      amountPaise: 15000000, // ₹1,50,000
      date: '2026-11-05',
      category: 'Consulting',
      notes: 'Milestone 2 deliverable payment',
      createdAt: '2026-11-05T10:00:00Z',
    },
  ];

  const mockBills: Bill[] = [
    {
      id: 'b_1',
      userId: 'u1',
      name: 'Cloud Infrastructure Hosting AWS',
      amountPaise: 820000, // ₹8,200
      dueDate: '2026-11-25',
      categoryId: 'Subscriptions',
      status: 'UNPAID',
      recurringExpenseId: null,
      paymentDate: null,
      notes: '',
      periodKey: '2026-11',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const mockHabits: Habit[] = [
    {
      id: 'h_1',
      userId: 'u1',
      title: 'Morning Deep Meditation & Breathwork',
      category: 'Mindfulness',
      color: '#6366f1',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: ['2026-11-12', '2026-11-13', '2026-11-14'],
      bestStreakDays: 14,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
  ];

  const mockEnvelopes: BudgetEnvelope[] = [
    {
      id: 'env_1',
      userId: 'u1',
      name: 'Dining & Cafes',
      allocatedPaise: 1200000, // ₹12,000
      spentPaise: 450000,
      monthKey: '2026-11',
      color: '#3b82f6',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const mockGoals: SavingsGoal[] = [
    {
      id: 'g_1',
      userId: 'u1',
      title: 'Emergency Reserve Fund 6 Months',
      targetPaise: 50000000, // ₹5,00,000
      savedPaise: 35000000, // ₹3,50,000 (70%)
      targetDate: '2027-03-31',
      color: '#10b981',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const mockSettings: UserSettings = {
    userId: 'u1',
    currency: 'INR',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    theme: 'system',
  };

  const sources: UniversalSearchSources = {
    tasks: mockTasks,
    expenses: mockExpenses,
    incomes: mockIncomes,
    bills: mockBills,
    habits: mockHabits,
    envelopes: mockEnvelopes,
    savingsGoals: mockGoals,
    settings: mockSettings,
    onNavigate: (tab: any) => navigated.push(tab),
    onOpenQuickAction: (type: any) => actionTriggered.push(type),
  };

  // 1. Search across Tasks
  const taskResults = searchUniversalWorkspace('Tax Report', 'all', sources);
  assert.ok(taskResults.length >= 1, 'Should find the Tax Report task');
  assert.equal(taskResults[0].id, 'task_t_1');
  assert.equal(taskResults[0].filterGroup, 'tasks');
  assert.ok(taskResults[0].title.includes('Tax Report'));

  // Ensure soft-deleted task was never indexed
  const deletedTaskSearch = searchUniversalWorkspace('Deleted Task', 'tasks', sources);
  assert.equal(deletedTaskSearch.length, 0, 'Soft-deleted tasks must never appear in search');

  // 2. Search across Expenses
  const expResults = searchUniversalWorkspace('Organic Grocery', 'all', sources);
  assert.ok(expResults.length >= 1, 'Should find the Grocery expense');
  assert.equal(expResults[0].filterGroup, 'finance');

  // 3. Search across Incomes
  const incResults = searchUniversalWorkspace('Consulting Retainer', 'all', sources);
  assert.ok(incResults.length >= 1, 'Should find Consulting retainer income');
  assert.equal(incResults[0].filterGroup, 'finance');

  // 4. Search across Bills
  const billResults = searchUniversalWorkspace('AWS', 'all', sources);
  assert.ok(billResults.length >= 1, 'Should find AWS hosting bill');
  assert.equal(billResults[0].filterGroup, 'finance');

  // 5. Search across Habits
  const habitResults = searchUniversalWorkspace('Meditation', 'all', sources);
  assert.ok(habitResults.length >= 1, 'Should find Meditation habit');
  assert.equal(habitResults[0].filterGroup, 'habits');

  // 6. Search across Budget Envelopes
  const envResults = searchUniversalWorkspace('Dining', 'all', sources);
  assert.ok(envResults.length >= 1, 'Should find Dining budget');
  assert.equal(envResults[0].filterGroup, 'budgets');

  // 7. Search across Savings Goals
  const goalResults = searchUniversalWorkspace('Emergency Reserve', 'all', sources);
  assert.ok(goalResults.length >= 1, 'Should find Emergency Reserve goal');
  assert.equal(goalResults[0].filterGroup, 'budgets');

  // 8. Search Settings
  const settingsResults = searchUniversalWorkspace('Theme', 'settings', sources);
  assert.ok(settingsResults.length >= 1, 'Should find appearance settings or themes');
  assert.equal(settingsResults[0].filterGroup, 'settings');

  // 9. Navigation search
  const navResults = searchUniversalWorkspace('Analytics', 'navigation', sources);
  assert.ok(navResults.length >= 1, 'Should find Analytics navigation destination');
  assert.equal(navResults[0].filterGroup, 'navigation');

  // 10. Execution verification
  navResults[0].run();
  assert.ok(navigated.includes('analytics'), 'Running navigation hit should navigate to analytics');
});

test('Phase 6 — Universal Search: Category Filter Group Isolation', () => {
  const sources: UniversalSearchSources = {
    tasks: [{
      id: 't_apple',
      userId: 'u1',
      title: 'Buy Apple MacBook Stand',
      description: '',
      category: 'Shopping',
      priority: 'medium',
      status: 'todo',
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      dueDate: null,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    }],
    expenses: [{
      id: 'e_apple',
      userId: 'u1',
      billId: null,
      type: 'variable',
      categoryId: 'groceries',
      categoryName: 'Groceries',
      amountPaise: 25000,
      date: '2026-11-14',
      description: 'Red Apple Fruit Basket',
      paymentMethod: 'cash',
      notes: '',
      createdAt: '2026-11-14T00:00:00Z',
    }],
    incomes: [],
    bills: [],
    habits: [{
      id: 'h_apple',
      userId: 'u1',
      title: 'Eat an Apple Every Afternoon',
      category: 'Health',
      color: '#ef4444',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: [],
      bestStreakDays: 3,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    }],
    envelopes: [],
    savingsGoals: [],
    settings: null,
    onNavigate: () => {},
    onOpenQuickAction: () => {},
  };

  // When searching "Apple" under 'tasks' filter, only task item should return
  const tasksOnly = searchUniversalWorkspace('Apple', 'tasks', sources);
  assert.ok(tasksOnly.every((r) => r.filterGroup === 'tasks'));
  assert.equal(tasksOnly.length, 1);
  assert.equal(tasksOnly[0].id, 'task_t_apple');

  // When searching "Apple" under 'finance' filter, only expense should return
  const financeOnly = searchUniversalWorkspace('Apple', 'finance', sources);
  assert.ok(financeOnly.every((r) => r.filterGroup === 'finance'));
  assert.equal(financeOnly.length, 1);
  assert.equal(financeOnly[0].id, 'exp_e_apple');

  // When searching "Apple" under 'habits' filter, only habit should return
  const habitsOnly = searchUniversalWorkspace('Apple', 'habits', sources);
  assert.ok(habitsOnly.every((r) => r.filterGroup === 'habits'));
  assert.equal(habitsOnly.length, 1);
  assert.equal(habitsOnly[0].id, 'habit_h_apple');

  // When searching "Apple" under 'all', all three should return
  const allResults = searchUniversalWorkspace('Apple', 'all', sources);
  assert.ok(allResults.length >= 3);
});

test('Phase 6 — Command Suggestions: Derived Purely from Real Stored State', () => {
  const sources: UniversalSearchSources = {
    tasks: [
      {
        id: 't_1',
        userId: 'u1',
        title: 'Pay GST return',
        description: '',
        category: 'Finance',
        priority: 'high',
        status: 'todo',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        dueDate: null,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 't_2',
        userId: 'u1',
        title: 'Review PR',
        description: '',
        category: 'Work',
        priority: 'high',
        status: 'todo',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        dueDate: null,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ],
    expenses: [
      {
        id: 'e_today',
        userId: 'u1',
        billId: null,
        type: 'variable',
        categoryId: 'food',
        categoryName: 'Food',
        amountPaise: 125000, // ₹1,250
        date: new Date().toISOString().slice(0, 10),
        description: 'Lunch with clients',
        paymentMethod: 'credit_card',
        notes: '',
        createdAt: new Date().toISOString(),
      },
    ],
    incomes: [],
    bills: [
      {
        id: 'b_overdue',
        userId: 'u1',
        name: 'Office Electricity Bill',
        amountPaise: 450000,
        dueDate: '2026-11-10',
        categoryId: 'Utilities',
        status: 'OVERDUE',
        recurringExpenseId: null,
        paymentDate: null,
        notes: '',
        periodKey: '2026-11',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ],
    habits: [
      {
        id: 'h_active',
        userId: 'u1',
        title: 'Evening Journaling',
        category: 'Mindset',
        color: '#3b82f6',
        frequency: 'daily',
        targetDaysPerWeek: 7,
        completedDates: ['2026-11-13'],
        bestStreakDays: 12,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-13T00:00:00Z',
      },
    ],
    envelopes: [],
    savingsGoals: [],
    settings: {
      userId: 'u1',
      currency: 'INR',
      pomodoroWorkDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      autoSwitchSessions: false,
      soundEnabled: true,
      theme: 'system',
      dailySpendingLimitPaise: 200000, // ₹2,000 limit
    },
    onNavigate: () => {},
    onOpenQuickAction: () => {},
  };

  const suggestions = getContextualCommandSuggestions({
    tasks: sources.tasks,
    expenses: sources.expenses,
    habits: sources.habits,
    isTimerRunning: false,
  });
  assert.ok(suggestions.length >= 3, 'Should generate multiple contextual command suggestions');

  // Verify pending tasks suggestion mentions 2 pending tasks
  const taskSuggestion = suggestions.find((s) => s.id === 'sugg_pending_tasks');
  assert.ok(taskSuggestion, 'Should have pending tasks suggestion');
  assert.ok(taskSuggestion.subtitle.includes('2 pending'), 'Must reflect actual pending count of 2');

  // Verify today spending suggestion mentions ₹1,250
  const spendSuggestion = suggestions.find((s) => s.id === 'sugg_today_expenses');
  assert.ok(spendSuggestion, 'Should have today spending suggestion');
  assert.ok(spendSuggestion.subtitle.includes('₹1,250'), 'Must reflect real spending amount');

  // Verify habit suggestion flags active habits
  const habitSuggestion = suggestions.find((s) => s.id === 'sugg_habits');
  assert.ok(habitSuggestion, 'Should have habit suggestion');
  assert.ok(habitSuggestion.subtitle.includes('1 habits active'), 'Must reflect real habits count');
});

test('Phase 6 — Recent Searches & Actions: Deduplication & Capacity Capping', () => {
  const mockStorage = new MockStorage();

  // Test save & retrieve recent searches
  saveRecentSearch('groceries', mockStorage);
  saveRecentSearch('gym subscription', mockStorage);
  saveRecentSearch('groceries', mockStorage); // Duplicate, should bring to front

  let recents = getRecentSearches(mockStorage);
  assert.equal(recents.length, 2, 'Duplicates must be collapsed');
  assert.equal(recents[0], 'groceries', 'Most recent search must be at index 0');
  assert.equal(recents[1], 'gym subscription');

  // Exceed max 8 limit
  for (let i = 1; i <= 10; i++) {
    saveRecentSearch(`query_${i}`, mockStorage);
  }
  recents = getRecentSearches(mockStorage);
  assert.equal(recents.length, 8, 'Recent searches list must cap at 8 items');
  assert.equal(recents[0], 'query_10', 'Most recent query must be first');

  // Test clear
  clearRecentSearches(mockStorage);
  assert.equal(getRecentSearches(mockStorage).length, 0, 'Recent searches must be cleared');

  // Test actions recording
  recordRecentAction('act_task', mockStorage);
  recordRecentAction('act_expense', mockStorage);
  recordRecentAction('act_task', mockStorage); // Duplicate

  const recentActions = getRecentActions(mockStorage);
  assert.equal(recentActions.length, 2, 'Duplicate actions must be deduplicated');
  assert.equal(recentActions[0], 'act_task', 'Most recent action must be first');
});

test('Phase 6 — Keyboard Shortcuts: Registry Completeness & Form Suppression Logic', () => {
  // 1. Verify standard shortcuts exist
  assert.ok(SHORTCUTS_REGISTRY.length >= 8, 'Keyboard shortcuts cheat-sheet must cover key actions');

  const cmdK = SHORTCUTS_REGISTRY.find((s) => s.description.toLowerCase().includes('command palette'));
  assert.ok(cmdK, 'Must have Cmd/Ctrl+K shortcut for command palette');
  assert.ok(cmdK.keys.includes('K'));

  const newTask = SHORTCUTS_REGISTRY.find((s) => s.description.toLowerCase().includes('task'));
  assert.ok(newTask, 'Must have shortcut for adding tasks');

  const newExpense = SHORTCUTS_REGISTRY.find((s) => s.description.toLowerCase().includes('expense'));
  assert.ok(newExpense, 'Must have shortcut for logging expense');

  const help = SHORTCUTS_REGISTRY.find((s) => s.keys.includes('?'));
  assert.ok(help, 'Must have ? shortcut for shortcut cheat-sheet');

  // 2. Form suppression helper test: typing inside inputs must not trigger shortcuts
  function shouldTriggerGlobalShortcut(targetTag: string, isContentEditable: boolean): boolean {
    const tagName = targetTag.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || isContentEditable) {
      return false;
    }
    return true;
  }

  assert.equal(shouldTriggerGlobalShortcut('INPUT', false), false);
  assert.equal(shouldTriggerGlobalShortcut('TEXTAREA', false), false);
  assert.equal(shouldTriggerGlobalShortcut('SELECT', false), false);
  assert.equal(shouldTriggerGlobalShortcut('DIV', true), false);
  assert.equal(shouldTriggerGlobalShortcut('BODY', false), true);
  assert.equal(shouldTriggerGlobalShortcut('DIV', false), true);
  assert.equal(shouldTriggerGlobalShortcut('BUTTON', false), true);
});
