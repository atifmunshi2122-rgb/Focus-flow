import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHEET_NAMES,
  getSheetId,
  WORKSHEET_HEADERS,
  SHEET_COLUMN_FORMATS,
  buildCreateStylingRequests,
  buildSyncValueUpdates,
  buildSyncResizeRequests,
  formatPaymentMethodLabel,
} from '../src/lib/googleSheetsService.ts';
import {
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  RecurringExpense,
  Bill,
  PaymentHistory,
  Task,
  BudgetEnvelope,
  SavingsGoal,
  DurableSyncOperation,
} from '../src/types/index.ts';

test('Google Sheets — 23 Master Worksheets Specification & Deterministic IDs', () => {
  assert.equal(WORKSHEET_NAMES.length, 23, 'Must have exactly 23 master worksheets');
  assert.equal(WORKSHEET_NAMES[0], 'Executive_Dashboard', 'Executive_Dashboard must be the first worksheet');
  assert.equal(WORKSHEET_NAMES[1], 'Finance_Dashboard', 'Finance_Dashboard must be sheet 2');
  assert.equal(WORKSHEET_NAMES[2], 'Productivity_Dashboard', 'Productivity_Dashboard must be sheet 3');

  // Verify deterministic, unique sheet IDs
  const idSet = new Set<number>();
  for (const name of WORKSHEET_NAMES) {
    const id = getSheetId(name);
    assert.ok(id >= 100 && id < 150, `Sheet ID for ${name} must be in valid range`);
    assert.ok(!idSet.has(id), `Duplicate sheet ID detected: ${id} for ${name}`);
    idSet.add(id);
  }
  assert.equal(idSet.size, 23);
});

test('Google Sheets — Complete Headers & Format Specifications across all 23 Sheets', () => {
  for (const name of WORKSHEET_NAMES) {
    const headers = WORKSHEET_HEADERS[name];
    assert.ok(Array.isArray(headers) && headers.length > 0, `Headers must exist for ${name}`);

    const format = SHEET_COLUMN_FORMATS[name];
    assert.ok(format !== undefined, `Column format spec must exist for ${name}`);
    assert.ok(Array.isArray(format.currencyCols), `currencyCols array required for ${name}`);
    assert.ok(Array.isArray(format.percentCols), `percentCols array required for ${name}`);
    assert.ok(Array.isArray(format.integerCols), `integerCols array required for ${name}`);
    assert.ok(Array.isArray(format.decimalCols), `decimalCols array required for ${name}`);
  }

  // Verify financial currency columns formatting
  assert.ok(SHEET_COLUMN_FORMATS.Income.currencyCols.includes(4), 'Income col E must be formatted as currency');
  assert.ok(SHEET_COLUMN_FORMATS.Variable_Expenses.currencyCols.includes(4), 'Variable expense col E must be currency');
  assert.ok(SHEET_COLUMN_FORMATS.Bills_Payments.currencyCols.includes(4), 'Bill col E must be currency');
  assert.ok(SHEET_COLUMN_FORMATS.Budgets.currencyCols.includes(2), 'Budget allocated must be currency');
  assert.ok(SHEET_COLUMN_FORMATS.Budgets.percentCols.includes(5), 'Budget utilization must be percentage');
});

test('Google Sheets — Batch Styling Requests: Themes, Banding, Dropdowns, Rules & 5 Charts', () => {
  const requests = buildCreateStylingRequests() as Array<Record<string, unknown>>;
  assert.ok(requests.length > 50, 'Must generate comprehensive batch styling requests');

  // Verify banding requests
  const bandingReqs = requests.filter((r) => 'addBanding' in r);
  assert.equal(bandingReqs.length, 23, 'All 23 worksheets must have alternating row banding');

  // Verify data validation dropdowns
  const validationReqs = requests.filter((r) => 'setDataValidation' in r);
  assert.ok(validationReqs.length >= 6, 'Must apply dropdown validations to Bills, Tasks, Fixed Expenses, Budgets');

  // Verify conditional formatting rules
  const conditionalReqs = requests.filter((r) => 'addConditionalFormatRule' in r);
  assert.ok(conditionalReqs.length >= 8, 'Must apply conditional formatting for PAID/UNPAID/OVERDUE and Net Cashflow');

  // Verify 5 native Google Sheets embedded charts
  const chartReqs = requests.filter((r) => 'addChart' in r);
  assert.equal(chartReqs.length, 5, 'Must embed exactly 5 executive charts across the dashboards');

  // Verify Basic Filters on raw data tables
  const filterReqs = requests.filter((r) => 'setBasicFilter' in r);
  assert.ok(filterReqs.length >= 7, 'Basic filters must be set on raw data tables');
});

test('Google Sheets — Value Updates Builder generates Dynamic Formulas & Prevents Data Destruction', () => {
  const mockSessions: FocusSession[] = [
    {
      id: 'ses_1',
      userId: 'usr_test',
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-12T10:00:00.000Z',
      endedAt: '2026-11-12T10:25:00.000Z',
      taskTitle: 'Architect Google Sheets Master Engine',
      taskId: null,
    },
  ];

  const mockIncomes: IncomeTransaction[] = [
    {
      id: 'inc_1',
      userId: 'usr_test',
      date: '2026-11-12',
      source: 'Client Retainer',
      category: 'Consulting',
      amountPaise: 15000000, // ₹1,50,000.00
      notes: 'Monthly enterprise retainer',
      createdAt: '2026-11-12T00:00:00.000Z',
    },
  ];

  const mockExpenses: ExpenseTransaction[] = [
    {
      id: 'exp_1',
      userId: 'usr_test',
      date: '2026-11-12',
      description: 'Supermarket Groceries',
      categoryId: 'cat_3',
      categoryName: 'Groceries',
      amountPaise: 450000, // ₹4,500.00
      type: 'variable',
      paymentMethod: 'upi_bank',
      billId: null,
      notes: '',
      createdAt: '2026-11-12T00:00:00.000Z',
    },
  ];

  const mockBills: Bill[] = [
    {
      id: 'bill_1',
      userId: 'usr_test',
      name: 'High-Speed Fiber Internet',
      amountPaise: 149900, // ₹1,499.00
      dueDate: '2026-11-20',
      status: 'UNPAID',
      recurringExpenseId: null,
      categoryId: 'cat_2',
      paymentDate: null,
      notes: '',
      periodKey: '2026-11',
      createdAt: '2026-11-12T00:00:00.000Z',
      updatedAt: '2026-11-12T00:00:00.000Z',
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task_1',
      userId: 'usr_test',
      title: 'Deploy Production Google Sheets Sync',
      description: 'Enterprise Google Sheets Master System',
      priority: 'high',
      status: 'in_progress',
      estimatedPomodoros: 3,
      completedPomodoros: 1,
      dueDate: '2026-11-15',
      category: 'Engineering',
      order: 0,
      createdAt: '2026-11-12T00:00:00.000Z',
      updatedAt: '2026-11-12T00:00:00.000Z',
    },
  ];

  const mockEnvelopes: BudgetEnvelope[] = [
    {
      id: 'env_1',
      userId: 'usr_test',
      name: 'Groceries & Provisions',
      allocatedPaise: 2500000, // ₹25,000.00
      spentPaise: 450000,
      monthKey: '2026-11',
      color: '#10b981',
      createdAt: '2026-11-12T00:00:00.000Z',
      updatedAt: '2026-11-12T00:00:00.000Z',
    },
  ];

  const mockGoals: SavingsGoal[] = [
    {
      id: 'goal_1',
      userId: 'usr_test',
      title: 'Emergency Reserve Fund',
      targetPaise: 50000000, // ₹5,00,000.00
      savedPaise: 18500000,
      targetDate: '2027-03-31',
      color: '#3b82f6',
      createdAt: '2026-11-12T00:00:00.000Z',
      updatedAt: '2026-11-12T00:00:00.000Z',
    },
  ];

  const updates = buildSyncValueUpdates({
    sessions: mockSessions,
    incomes: mockIncomes,
    recurring: [],
    expenses: mockExpenses,
    bills: mockBills,
    tasks: mockTasks,
    envelopes: mockEnvelopes,
    savingsGoals: mockGoals,
  });

  // Verify updates cover all 23 sheets
  assert.equal(updates.length, 23, 'Must output update ranges for all 23 worksheets');

  // Verify Executive Dashboard formulas
  const execUpdate = updates.find((u) => u.range.startsWith('Executive_Dashboard!'));
  assert.ok(execUpdate !== undefined, 'Executive_Dashboard update range required');
  const execValues = execUpdate.values;
  const flattenedExec = execValues.flat().map(String);

  // Must reference dynamic Google Sheets formulas rather than static values!
  assert.ok(flattenedExec.some((v) => v.includes('=SUM(Income!E2:E)')), 'Must use =SUM(Income!E2:E) for gross inflow');
  assert.ok(flattenedExec.some((v) => v.includes('=SUM(Variable_Expenses!E2:E)')), 'Must use formula for operating outflows');
  assert.ok(flattenedExec.some((v) => v.includes('Bills_Payments!F:F, "PAID"')), 'Must use =SUMIF for paid bills');
  assert.ok(flattenedExec.some((v) => v.includes('Bills_Payments!F:F, "OVERDUE"')), 'Must use =SUMIF for overdue bills');

  // Verify Tasks sheet mapping
  const tasksUpdate = updates.find((u) => u.range.startsWith('Tasks!'));
  assert.ok(tasksUpdate !== undefined);
  assert.equal(tasksUpdate.values[0][0], 'task_1');
  assert.equal(tasksUpdate.values[0][1], 'Deploy Production Google Sheets Sync');
  assert.equal(tasksUpdate.values[0][2], 'high');

  // Verify Budgets sheet mapping
  const budgetsUpdate = updates.find((u) => u.range.startsWith('Budgets!'));
  assert.ok(budgetsUpdate !== undefined);
  assert.equal(budgetsUpdate.values[0][1], 'Groceries & Provisions');
  assert.equal(budgetsUpdate.values[0][2], 25000); // Allocated in Rupees

  // Verify Auto-Resize requests
  const resizeReqs = buildSyncResizeRequests();
  assert.equal(resizeReqs.length, 23, 'Auto-resize requests must cover all 23 worksheets');
});

test('Google Sheets — formatPaymentMethodLabel resolves UPI, Card, Auto-Debit cleanly', () => {
  assert.equal(formatPaymentMethodLabel('upi_bank', true), 'UPI / Bank');
  assert.equal(formatPaymentMethodLabel('card', true), 'Card');
  assert.equal(formatPaymentMethodLabel('cash', true), 'Cash');
  assert.equal(formatPaymentMethodLabel('auto_debit', true), 'Auto-Debit');
  assert.equal(formatPaymentMethodLabel(null, false), '—');
});
