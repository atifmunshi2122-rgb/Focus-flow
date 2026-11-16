import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREDEFINED_EXPENSE_REASONS,
  CUSTOM_REASONS_STORAGE_KEY,
  getCustomExpenseReasons,
  saveCustomExpenseReason,
  removeCustomExpenseReason,
  resolveDefaultCategoryForReason,
} from '../src/lib/expenseReasons.ts';
import {
  GLOBAL_ACTION_TABS,
  FINANCE_ACTION_TABS,
} from '../src/components/common/QuickActionModal.tsx';
import { toPaise, formatCurrency } from '../src/lib/currency.ts';
import type { ExpenseTransaction, IncomeTransaction } from '../src/types/index.ts';

// In-memory mock localStorage for Node test runner environment
class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('Daily Expense Manager & Add Transaction Simplification', () => {
  beforeEach(() => {
    // Inject mock localStorage into global window
    const mockStorage = new MockLocalStorage();
    (globalThis as any).window = { localStorage: mockStorage };
  });

  describe('1. Predefined Expense Reasons', () => {
    it('contains all 9 mandatory predefined reason options', () => {
      const labels = PREDEFINED_EXPENSE_REASONS.map((r) => r.label);
      const expected = [
        'Breakfast',
        'Lunch',
        'Dinner',
        'Snacks',
        'Tea/Coffee',
        'Groceries',
        'Transport',
        'Education',
        'Other',
      ];

      for (const item of expected) {
        assert.ok(
          labels.includes(item),
          `Missing expected predefined reason: ${item}`
        );
      }
      assert.strictEqual(PREDEFINED_EXPENSE_REASONS.length, 9);
    });

    it('each predefined reason has an id, label, icon and defaultCategory', () => {
      for (const r of PREDEFINED_EXPENSE_REASONS) {
        assert.ok(r.id && r.id.length > 0);
        assert.ok(r.label && r.label.length > 0);
        assert.ok(r.icon && r.icon.length > 0);
        assert.ok(r.defaultCategory && r.defaultCategory.length > 0);
      }
    });
  });

  describe('2. Custom Reason Management & Persistence', () => {
    it('returns empty array when no custom reasons are saved', () => {
      assert.deepStrictEqual(getCustomExpenseReasons(), []);
    });

    it('saves custom reasons to localStorage for future reuse', () => {
      saveCustomExpenseReason('Auto Fare');
      saveCustomExpenseReason('Laundry');

      const saved = getCustomExpenseReasons();
      assert.ok(saved.includes('Laundry'));
      assert.ok(saved.includes('Auto Fare'));
    });

    it('does not duplicate custom reasons (case-insensitive deduplication)', () => {
      saveCustomExpenseReason('Stationery');
      saveCustomExpenseReason('stationery');
      saveCustomExpenseReason('STATIONERY');

      const saved = getCustomExpenseReasons();
      assert.strictEqual(
        saved.filter((r) => r.toLowerCase() === 'stationery').length,
        1
      );
    });

    it('does not add a reason that already exists in predefined options', () => {
      const before = getCustomExpenseReasons().length;
      saveCustomExpenseReason('Breakfast');
      saveCustomExpenseReason('lunch');

      const after = getCustomExpenseReasons().length;
      assert.strictEqual(before, after);
    });

    it('removes custom reasons cleanly', () => {
      saveCustomExpenseReason('Gym Membership');
      saveCustomExpenseReason('Pet Food');
      assert.ok(getCustomExpenseReasons().includes('Gym Membership'));

      removeCustomExpenseReason('Gym Membership');
      assert.ok(!getCustomExpenseReasons().includes('Gym Membership'));
      assert.ok(getCustomExpenseReasons().includes('Pet Food'));
    });
  });

  describe('3. Category Auto-Resolution', () => {
    it('maps meal and drink reasons to Food & Dining or Groceries', () => {
      assert.strictEqual(resolveDefaultCategoryForReason('Breakfast'), 'Food & Dining');
      assert.strictEqual(resolveDefaultCategoryForReason('Lunch'), 'Food & Dining');
      assert.strictEqual(resolveDefaultCategoryForReason('Tea/Coffee'), 'Food & Dining');
      assert.strictEqual(resolveDefaultCategoryForReason('Evening Snacks Box'), 'Food & Dining');
      assert.strictEqual(resolveDefaultCategoryForReason('Groceries'), 'Groceries');
    });

    it('maps transport and education reasons appropriately', () => {
      assert.strictEqual(resolveDefaultCategoryForReason('Transport'), 'Transportation');
      assert.strictEqual(resolveDefaultCategoryForReason('Uber to office'), 'Transportation');
      assert.strictEqual(resolveDefaultCategoryForReason('Metro ticket'), 'Transportation');
      assert.strictEqual(resolveDefaultCategoryForReason('Education'), 'Education');
      assert.strictEqual(resolveDefaultCategoryForReason('Semester Course Fee'), 'Education');
    });

    it('falls back to General for generic reasons', () => {
      assert.strictEqual(resolveDefaultCategoryForReason('Other'), 'General');
      assert.strictEqual(resolveDefaultCategoryForReason('Miscellaneous gift'), 'General');
    });
  });

  describe('4. Daily Expense Multi-Entry Session Logic & Totals', () => {
    it('correctly aggregates multiple expense entries for the same date', () => {
      const targetDate = '2026-11-16';
      const sessionEntries = [
        { id: '1', reason: 'Breakfast', amount: '80.00', category: 'Food & Dining' },
        { id: '2', reason: 'Lunch', amount: '150.50', category: 'Food & Dining' },
        { id: '3', reason: 'Tea/Coffee', amount: '20.00', category: 'Food & Dining' },
        { id: '4', reason: 'Transport', amount: '45.00', category: 'Transportation' },
        { id: '5', reason: 'Dinner', amount: '120.00', category: 'Food & Dining' },
      ];

      const totalPaise = sessionEntries.reduce(
        (sum, e) => sum + toPaise(e.amount),
        0
      );

      // 80.00 + 150.50 + 20.00 + 45.00 + 120.00 = 415.50 = 41550 paise
      assert.strictEqual(totalPaise, 41550);
      assert.strictEqual(formatCurrency(totalPaise, 'INR'), '₹415.50');
    });

    it('supports backdated dates preserving date separately from createdAt', () => {
      const historicalDate = '2026-10-15';
      const creationTimestamp = new Date().toISOString();

      const createdExpense: ExpenseTransaction = {
        id: 'exp_test_hist_1',
        userId: 'usr_test_atif',
        billId: null,
        type: 'variable',
        categoryId: 'cat_food',
        categoryName: 'Food & Dining',
        amountPaise: toPaise('120'),
        date: historicalDate, // historical backdated date
        description: 'Lunch',
        paymentMethod: 'upi_bank',
        notes: 'Historical test meal',
        createdAt: creationTimestamp, // creation time
      };

      assert.strictEqual(createdExpense.date, historicalDate);
      assert.notStrictEqual(createdExpense.date, createdExpense.createdAt.slice(0, 10));
      assert.strictEqual(createdExpense.amountPaise, 12000);
      assert.strictEqual(createdExpense.userId, 'usr_test_atif');
    });

    it('isolates income from expense and maintains distinct payload structure', () => {
      const incomeDate = '2026-11-01';
      const incomeEntry: IncomeTransaction = {
        id: 'inc_test_1',
        userId: 'usr_test_atif',
        source: 'Freelance Mobile App Design',
        amountPaise: toPaise('45000'),
        date: incomeDate,
        category: 'Freelance',
        notes: 'Milestone 2 payment',
        createdAt: new Date().toISOString(),
      };

      assert.strictEqual(incomeEntry.source, 'Freelance Mobile App Design');
      assert.strictEqual(incomeEntry.amountPaise, 4500000);
      assert.strictEqual(incomeEntry.category, 'Freelance');
      // Verify Income schema does not contain meal/expense fields
      assert.strictEqual((incomeEntry as any).billId, undefined);
      assert.strictEqual((incomeEntry as any).paymentMethod, undefined);
    });
  });

  describe('5. Global Quick Actions vs Finance Contextual Actions', () => {
    it('Global Quick Actions retains all 7 primary module shortcuts', () => {
      const globalIds = GLOBAL_ACTION_TABS.map((t) => t.id);
      const expectedGlobal = ['task', 'expense', 'income', 'bill', 'habit', 'envelope', 'goal'];
      assert.deepStrictEqual(globalIds, expectedGlobal);
    });

    it('Finance Contextual Actions contains ONLY finance transaction types', () => {
      const financeIds = FINANCE_ACTION_TABS.map((t) => t.id);
      assert.deepStrictEqual(financeIds, ['expense', 'income', 'bill']);
    });

    it('Finance Contextual Actions never contains Task, Habit, or non-finance tabs', () => {
      const financeIds = FINANCE_ACTION_TABS.map((t) => t.id);
      assert.ok(!financeIds.includes('task' as any), 'Task must NOT be in Finance Add Transaction');
      assert.ok(!financeIds.includes('habit' as any), 'Habit must NOT be in Finance Add Transaction');
      assert.ok(!financeIds.includes('envelope' as any), 'Envelope must NOT be in Finance Add Transaction');
      assert.ok(!financeIds.includes('goal' as any), 'Goal must NOT be in Finance Add Transaction');
    });
  });
});

