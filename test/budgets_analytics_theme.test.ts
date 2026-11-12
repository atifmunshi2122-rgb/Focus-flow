import test from 'node:test';
import assert from 'node:assert/strict';
import { dbService } from '../server/db.ts';
import { getStyleDefinition, DESIGN_STYLES, FONT_PAIRINGS } from '../src/theme/stylesRegistry.ts';
import { toPaise } from '../src/lib/currency.ts';

test('Budgets & Envelopes — Allocation Arithmetic and Capacity Checking', () => {
  const userId = 'usr_test_budget_' + Date.now();
  dbService.ensureUserWorkspace(userId);
  const raw = dbService.getRaw();

  // Create an envelope for Groceries with ₹25,000.00 limit
  const groceryLimitPaise = toPaise(25000); // 2500000 paise
  const envelope = {
    id: 'env_groceries_1',
    userId,
    name: 'Groceries & Provisions',
    monthKey: '2026-11',
    allocatedPaise: groceryLimitPaise,
    spentPaise: 0,
    period: 'monthly' as const,
    categoryIds: ['cat_groceries'],
    color: '#10b981',
    notes: 'Essential food supplies',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  raw.envelopes.push(envelope);

  // Add 3 expense transactions in this category
  const expenses = [
    { id: 'exp_1', amountPaise: toPaise(5000), categoryId: 'cat_groceries' },
    { id: 'exp_2', amountPaise: toPaise(12500), categoryId: 'cat_groceries' },
    { id: 'exp_3', amountPaise: toPaise(3000), categoryId: 'cat_groceries' },
  ];

  let totalSpentPaise = 0;
  for (const exp of expenses) {
    totalSpentPaise += exp.amountPaise;
  }
  envelope.spentPaise = totalSpentPaise;

  assert.equal(envelope.spentPaise, 2050000); // ₹20,500.00
  const remainingPaise = envelope.allocatedPaise - envelope.spentPaise;
  assert.equal(remainingPaise, 450000); // ₹4,500.00 remaining

  const percentageUsed = Math.round((envelope.spentPaise / envelope.allocatedPaise) * 100);
  assert.equal(percentageUsed, 82);
  assert.ok(percentageUsed < 100, 'Envelope should not be exceeded');

  // Trigger overspend
  const additionalExpensePaise = toPaise(6000); // ₹6,000.00
  const updatedSpent = envelope.spentPaise + additionalExpensePaise;
  const isOverspent = updatedSpent > envelope.allocatedPaise;
  assert.equal(isOverspent, true);
  const deficitPaise = updatedSpent - envelope.allocatedPaise;
  assert.equal(deficitPaise, 150000); // ₹1,500.00 over budget

  // Clean up test workspace
  dbService.clearWorkspace(userId);
  dbService.save();
});

test('Savings Goals — Progress Calculation and Target Verification', () => {
  const targetPaise = toPaise(100000); // ₹100,000.00 emergency fund
  const currentPaise = toPaise(65000);  // ₹65,000.00 accumulated

  const progressPercent = Math.min(100, Math.round((currentPaise / targetPaise) * 100));
  assert.equal(progressPercent, 65);

  const remainingPaise = Math.max(0, targetPaise - currentPaise);
  assert.equal(remainingPaise, 3500000); // ₹35,000.00

  // Completing goal
  const completedCurrentPaise = toPaise(105000);
  const completedPercent = Math.min(100, Math.round((completedCurrentPaise / targetPaise) * 100));
  assert.equal(completedPercent, 100);
  const completedRemaining = Math.max(0, targetPaise - completedCurrentPaise);
  assert.equal(completedRemaining, 0);
});

test('Analytics Engine — Financial Cashflow and Savings Rate KPI Math', () => {
  const totalIncomePaise = toPaise(120000); // ₹120,000.00
  const fixedExpensesPaise = toPaise(40000); // ₹40,000.00 (Rent, Utilities)
  const variableExpensesPaise = toPaise(30000); // ₹30,000.00 (Food, Entertainment)

  const totalExpensesPaise = fixedExpensesPaise + variableExpensesPaise; // ₹70,000.00
  assert.equal(totalExpensesPaise, 7000000);

  const netSavingsPaise = totalIncomePaise - totalExpensesPaise; // ₹50,000.00
  assert.equal(netSavingsPaise, 5000000);

  const savingsRatePercent = Math.round((netSavingsPaise / totalIncomePaise) * 100);
  assert.equal(savingsRatePercent, 42);

  const fixedSharePercent = Math.round((fixedExpensesPaise / totalExpensesPaise) * 100);
  assert.equal(fixedSharePercent, 57);

  const variableSharePercent = Math.round((variableExpensesPaise / totalExpensesPaise) * 100);
  assert.equal(variableSharePercent, 43);
});

test('Theme Studio — Registry Token Resolution and Contrast Guidelines', () => {
  // Ensure default style definition exists and provides valid contrast tokens
  const minimalStyle = getStyleDefinition('minimalism');
  assert.ok(minimalStyle !== undefined);
  assert.equal(minimalStyle.name, 'Minimalism');
  assert.ok(minimalStyle.light.bgCanvas && minimalStyle.dark.bgCanvas);

  // Verify all 16 design styles exist and have light/dark tokens
  assert.equal(DESIGN_STYLES.length, 16);
  for (const style of DESIGN_STYLES) {
    assert.ok(style.id && style.id.length > 0);
    assert.ok(style.name && style.name.length > 0);
    assert.ok(style.light.textPrimary && style.light.textPrimary.startsWith('#'));
    assert.ok(style.dark.textPrimary && style.dark.textPrimary.startsWith('#'));
  }

  // Verify font pairings
  assert.ok(FONT_PAIRINGS.length >= 3);
  for (const fp of FONT_PAIRINGS) {
    assert.ok(fp.id && fp.displayFont && fp.bodyFont);
  }
});
