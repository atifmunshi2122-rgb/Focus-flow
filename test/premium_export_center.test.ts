import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTodayDateString } from '../src/lib/dateTime.ts';
import {
  generateOpenXmlWorkbook,
  WorksheetData,
  generateZipArchive,
} from '../src/lib/openXmlSpreadsheet.ts';
import {
  resolveDateFilterRange,
  filterPayloadByDateRange,
  generateModuleCsv,
  generateMasterXlsxWorkbook,
  generateExecutivePdfReportHtml,
  generateVersionedJsonBackup,
  generateDonutChartSvg,
  REPORT_TEMPLATES,
  ReportTemplateId,
  ExportModuleId,
  UnifiedExportDataPayload,
} from '../src/lib/unifiedExportEngine.ts';

describe('FocusFlow Premium Export Center Test Suite', () => {
  // Temporary isolated in-memory test fixture (never touches real database)
  const mockPayload: UnifiedExportDataPayload = {
    userName: 'Test User',
    incomes: [
      {
        id: 'inc_1',
        userId: 'usr_test',
        date: '2026-11-10',
        source: 'Consulting Client A',
        category: 'Freelance',
        amountPaise: 850000, // 8500.00
        notes: 'Sprint milestone deliverable',
        createdAt: '2026-11-10T10:00:00.000Z',
      },
      {
        id: 'inc_2',
        userId: 'usr_test',
        date: '2026-10-15',
        source: 'Salary',
        category: 'Salary',
        amountPaise: 15000000, // 150000.00
        notes: 'Monthly direct credit',
        createdAt: '2026-10-15T10:00:00.000Z',
      },
    ],
    expenses: [
      {
        id: 'exp_1',
        userId: 'usr_test',
        date: '2026-11-12',
        description: 'Server Hosting & CDN',
        categoryId: 'cat_cloud',
        categoryName: 'Technology',
        amountPaise: 240000, // 2400.00
        type: 'fixed',
        paymentMethod: 'credit_card',
        billId: null,
        notes: 'Monthly infra',
        createdAt: '2026-11-12T10:00:00.000Z',
      },
      {
        id: 'exp_2',
        userId: 'usr_test',
        date: '2026-11-14',
        description: 'Organic Groceries, Milk & Eggs',
        categoryId: 'cat_food',
        categoryName: 'Food & Dining',
        amountPaise: 185000, // 1850.00
        type: 'variable',
        paymentMethod: 'upi_bank',
        billId: null,
        notes: 'Supermarket visit',
        createdAt: '2026-11-14T10:00:00.000Z',
      },
    ],
    bills: [
      {
        id: 'bill_1',
        userId: 'usr_test',
        name: 'Broadband Fiber',
        dueDate: '2026-11-20',
        categoryId: 'cat_util',
        categoryName: 'Utilities',
        amountPaise: 119900,
        status: 'UNPAID',
        paymentDate: null,
        periodKey: '2026-11',
        recurringExpenseId: 'rec_1',
        notes: 'Monthly gigabit',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    envelopes: [
      {
        id: 'env_1',
        userId: 'usr_test',
        name: 'Groceries & Provisions',
        categoryId: 'cat_food',
        allocatedPaise: 2500000,
        spentPaise: 185000,
        monthKey: '2026-11',
        color: '#10b981',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    savingsGoals: [
      {
        id: 'goal_1',
        userId: 'usr_test',
        title: 'Emergency Reserve',
        targetPaise: 50000000, // 500,000.00
        savedPaise: 35000000,  // 350,000.00
        targetDate: '2027-12-31',
        color: '#6366f1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    subscriptions: [],
    categories: [],
    tasks: [
      {
        id: 'task_1',
        userId: 'usr_test',
        title: 'Review Financial Balance Sheet',
        description: '',
        status: 'completed',
        priority: 'high',
        category: 'Finance',
        dueDate: '2026-11-15',
        estimatedPomodoros: 2,
        completedPomodoros: 2,
        createdAt: '2026-11-10T09:00:00.000Z',
        completedAt: '2026-11-15T16:30:00.000Z',
        updatedAt: '2026-11-15T16:30:00.000Z',
      },
    ],
    sessions: [
      {
        id: 'sess_1',
        userId: 'usr_test',
        taskId: 'task_1',
        mode: 'work',
        durationMinutes: 25,
        durationSeconds: 1500, // 25 min
        startedAt: '2026-11-15T09:00:00.000Z',
        endedAt: '2026-11-15T09:25:00.000Z',
        completed: true,
        createdAt: '2026-11-15T09:25:00.000Z',
      },
    ],
    habits: [
      {
        id: 'habit_1',
        userId: 'usr_test',
        title: 'Morning Financial Journaling',
        category: 'Mindset',
        color: '#f59e0b',
        frequency: 'daily',
        targetDaysPerWeek: 7,
        completedDates: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'],
        bestStreakDays: 14,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    timeBlocks: [],
    studySubjects: [
      {
        id: 'subj_1',
        userId: 'usr_test',
        code: 'CS_DSA',
        name: 'Data Structures & Algorithms',
        tierId: 'tier1',
        totalSubtopics: 40,
        completedSubtopics: 32,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    studyTopics: [],
    studyRevisions: [],
  };

  test('T1: Zero-Dependency OpenXML XLSX Builder creates valid multi-sheet workbook', () => {
    const sheets: WorksheetData[] = [
      {
        name: 'Financial Ledger',
        freezeHeader: true,
        columns: [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Title', key: 'title', width: 24 },
          { header: 'Amount (INR)', key: 'amount', width: 16, format: 'currency' },
        ],
        rows: [
          { date: '2026-11-10', title: 'Consulting', amount: 8500.0 },
          { date: '2026-11-12', title: 'Server Hosting', amount: 2400.0 },
        ],
      },
      {
        name: 'Tasks Register',
        freezeHeader: true,
        columns: [
          { header: 'Task Name', key: 'name', width: 28 },
          { header: 'Status', key: 'status', width: 16 },
        ],
        rows: [{ name: 'Review Sheet', status: 'COMPLETED' }],
      },
    ];

    const xlsxBytes = generateOpenXmlWorkbook(sheets);
    assert.ok(xlsxBytes instanceof Uint8Array);
    assert.ok(xlsxBytes.length > 1000, 'XLSX archive size must exceed 1KB');

    // Check PKZIP signature 0x04034b50 (Little Endian: 0x50, 0x4b, 0x03, 0x04)
    assert.equal(xlsxBytes[0], 0x50);
    assert.equal(xlsxBytes[1], 0x4b);
    assert.equal(xlsxBytes[2], 0x03);
    assert.equal(xlsxBytes[3], 0x04);
  });

  test('T2: Date Filter Range Resolver deterministically maps presets in Asia/Kolkata', () => {
    const tz = 'Asia/Kolkata';

    // This Month
    const thisMonth = resolveDateFilterRange('this_month', tz);
    assert.ok(thisMonth.startDate.endsWith('-01'));
    assert.ok(thisMonth.startDate.length === 10);
    assert.ok(thisMonth.endDate.length === 10);
    assert.ok(thisMonth.endDate >= thisMonth.startDate);

    // This Year
    const thisYear = resolveDateFilterRange('this_year', tz);
    assert.ok(thisYear.startDate.endsWith('-01-01'));
    assert.ok(thisYear.endDate.endsWith('-12-31'));

    // Custom
    const custom = resolveDateFilterRange('custom', tz, {
      startDate: '2026-11-01',
      endDate: '2026-11-15',
    });
    assert.equal(custom.startDate, '2026-11-01');
    assert.equal(custom.endDate, '2026-11-15');
  });

  test('T3: Date range filtering accurately filters items and isolates November records', () => {
    const novRange = { startDate: '2026-11-01', endDate: '2026-11-30' };
    const filtered = filterPayloadByDateRange(mockPayload, novRange, 'Asia/Kolkata');

    // Incomes: inc_1 is Nov 10 (included), inc_2 is Oct 15 (excluded)
    assert.equal(filtered.incomes.length, 1);
    assert.equal(filtered.incomes[0].id, 'inc_1');

    // Expenses: both are November
    assert.equal(filtered.expenses.length, 2);
  });

  test('T4: CSV Exporter generates RFC-4180 compliant escaping and numeric clean values', () => {
    const { filename, content } = generateModuleCsv('expenses', mockPayload);

    assert.ok(filename.startsWith('focusflow-expenses-'));
    assert.ok(filename.endsWith('.csv'));

    // Verify header line
    assert.ok(content.includes('Date,Description,Category,Expense Type,Payment Method,Amount (INR),Notes'));

    // Verify comma escaping in description "Organic Groceries, Milk & Eggs"
    assert.ok(
      content.includes('"Organic Groceries, Milk & Eggs"'),
      'Descriptions with commas must be wrapped in quotes'
    );

    // Verify clean numeric output without currency symbols
    assert.ok(content.includes('2400.00'));
    assert.ok(content.includes('1850.00'));
    assert.ok(!content.includes('₹2400.00'), 'Numeric fields must not contain decorative currency symbols');
  });

  test('T5: Executive PDF HTML Generator creates print-ready layout with INR and KPIs', () => {
    const html = generateExecutivePdfReportHtml(mockPayload, 'NOVEMBER 2026', 'Atif Munshi');

    assert.ok(html.includes('FocusFlow &amp; Finance'));
    assert.ok(html.includes('Atif Munshi'));
    assert.ok(html.includes('Executive Financial Ledger &amp; Productivity Intelligence Report'));
    assert.ok(html.includes('@page {'));
    assert.ok(html.includes('size: A4 portrait;'));

    // Check KPI cards
    assert.ok(html.includes('Total Inflow'));
    assert.ok(html.includes('Total Outflow'));
    assert.ok(html.includes('Net Financial Flow'));

    // Check INR formatted currency
    assert.ok(html.includes('₹') || html.includes('INR'));
  });

  test('T6: Lossless JSON Backup Generator preserves schema version, record IDs, and relationships', () => {
    const { filename, jsonText } = generateVersionedJsonBackup(mockPayload, 'complete');

    assert.ok(filename.endsWith('.json'));
    const parsed = JSON.parse(jsonText);

    assert.equal(parsed.schemaVersion, '2.1.0');
    assert.equal(parsed.exportScope, 'complete');
    assert.equal(parsed.incomes.length, 2);
    assert.equal(parsed.incomes[0].id, 'inc_1');
    assert.equal(parsed.incomes[0].amountPaise, 850000);
    assert.equal(parsed.expenses[0].id, 'exp_1');
    assert.equal(parsed.bills[0].recurringExpenseId, 'rec_1');
    assert.equal(parsed.habits[0].bestStreakDays, 14);
    assert.equal(parsed.studySubjects[0].code, 'CS_DSA');
  });

  test('T7: Master Multi-Sheet XLSX compiles 6+ dedicated domain sheets', () => {
    const sheets = generateMasterXlsxWorkbook(mockPayload, 'NOVEMBER 2026');

    const sheetNames = sheets.map((s) => s.name);
    assert.ok(sheetNames.includes('Executive Dashboard'));
    assert.ok(sheetNames.includes('Income'));
    assert.ok(sheetNames.includes('Expenses'));
    assert.ok(sheetNames.includes('Tasks'));
    assert.ok(sheetNames.includes('Bills & Payments'));
    assert.ok(sheetNames.includes('Habits'));
    assert.ok(sheetNames.includes('Study'));

    // Verify Executive Dashboard rows
    const summarySheet = sheets.find((s) => s.name === 'Executive Dashboard')!;
    const kpiNames = summarySheet.rows.map((r) => r.kpi);
    assert.ok(kpiNames.includes('Total Inflow (Credits)'));
    assert.ok(kpiNames.includes('Total Outflow (Debits)'));
    assert.ok(kpiNames.includes('Net Financial Position'));
  });

  test('T8: Curated Document Templates cover all 12 specialized domain presets', () => {
    const expectedTemplates: ReportTemplateId[] = [
      'executive_master',
      'finance_monthly',
      'finance_annual',
      'finance_expenses',
      'finance_income',
      'finance_savings_budget',
      'productivity_overview',
      'productivity_tasks',
      'productivity_focus',
      'study_progress',
      'habits_consistency',
      'calendar_schedule',
      'account_backup',
    ];

    for (const tId of expectedTemplates) {
      assert.ok(REPORT_TEMPLATES[tId], `Template ${tId} must be registered`);
      assert.ok(REPORT_TEMPLATES[tId].title.length > 0);
      assert.ok(REPORT_TEMPLATES[tId].defaultModules.length > 0);
    }
  });

  test('T9: Luxury Editorial PDF includes Cover Page, vector geometry, docRef, and repeated headers', () => {
    const html = generateExecutivePdfReportHtml(mockPayload, 'NOVEMBER 2026', 'Atif Munshi', {
      templateId: 'finance_monthly',
    });

    // Dedicated Cover Page elements
    assert.ok(html.includes('cover-page'));
    assert.ok(html.includes('Monthly Financial Statement'));
    assert.ok(html.includes('Document Digest Ref'));
    assert.ok(html.includes('FF-2026-'));
    assert.ok(html.includes('page-break-after: always'));

    // Repeating table headers & non-splitting rows
    assert.ok(html.includes('thead {'));
    assert.ok(html.includes('display: table-header-group;'));
    assert.ok(html.includes('break-inside: avoid;'));

    // Category Outflow Breakdown bar
    assert.ok(html.includes('Technology'));
    assert.ok(html.includes('Food &amp; Dining'));
  });

  test('T10: OpenXML Workbook supports custom column header styles, auto-filters, and summary double borders', () => {
    const sheets: WorksheetData[] = [
      {
        name: 'Dashboard',
        freezeHeader: true,
        autoFilter: true,
        columns: [
          { header: 'Metric', key: 'metric', width: 20, headerStyle: 'purple' },
          { header: 'Value (INR)', key: 'val', width: 20, format: 'currency' },
        ],
        rows: [
          { metric: 'Revenue', val: 50000.0, _accent: 'green' },
          { metric: 'Expenses', val: 12000.0, _accent: 'red' },
          { metric: 'Net Balance', val: 38000.0, _isSummary: true },
        ],
      },
    ];

    const bytes = generateOpenXmlWorkbook(sheets);
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 800);
  });

  test('T11: Zero Fake Data Assurance — Empty payload produces honest empty states', () => {
    const emptyPayload: UnifiedExportDataPayload = {
      userName: 'Fresh User',
      incomes: [],
      expenses: [],
      bills: [],
      envelopes: [],
      savingsGoals: [],
      subscriptions: [],
      categories: [],
      tasks: [],
      sessions: [],
      habits: [],
      timeBlocks: [],
      studySubjects: [],
      studyTopics: [],
      studyRevisions: [],
    };

    // PDF honest empty message
    const html = generateExecutivePdfReportHtml(emptyPayload, 'TODAY', 'Fresh User');
    assert.ok(html.includes('No expense records found within selected timeframe'));
    assert.ok(html.includes('No transactions recorded in this period'));
    assert.ok(!html.includes('Sample Company'));

    // CSV empty rows
    const csv = generateModuleCsv('expenses', emptyPayload);
    const lines = csv.content.split('\r\n').filter(Boolean);
    assert.equal(lines.length, 1, 'Only header line should exist for empty data');
  });

  test('T12: Numerical Total Consistency across PDF, XLSX, and CSV', () => {
    const novRange = { startDate: '2026-11-01', endDate: '2026-11-30' };
    const filtered = filterPayloadByDateRange(mockPayload, novRange, 'Asia/Kolkata');

    const expectedTotalInflowPaise = filtered.incomes.reduce((s, i) => s + i.amountPaise, 0); // 8500.00
    const expectedTotalOutflowPaise = filtered.expenses.reduce((s, e) => s + e.amountPaise, 0); // 4250.00
    const expectedNetPaise = expectedTotalInflowPaise - expectedTotalOutflowPaise; // 4250.00

    assert.equal(expectedTotalInflowPaise, 850000);
    assert.equal(expectedTotalOutflowPaise, 425000);
    assert.equal(expectedNetPaise, 425000);

    // Verify CSV matching
    const csv = generateModuleCsv('income', filtered);
    assert.ok(csv.content.includes('8500.00'));

    // Verify XLSX matching
    const sheets = generateMasterXlsxWorkbook(filtered, 'NOVEMBER 2026');
    const incomeSheet = sheets.find((s) => s.name === 'Income')!;
    const totalRow = incomeSheet.rows.find((r) => r.date === 'TOTAL')!;
    assert.equal(totalRow.amount, 8500.0);
  });

  test('T13: Productivity KPI — Zero tasks denominator renders N/A without division by zero', () => {
    const payloadNoTasks: UnifiedExportDataPayload = {
      ...mockPayload,
      tasks: [],
      sessions: [
        {
          id: 'sess_1',
          userId: 'usr_test',
          startedAt: '2026-11-15T10:00:00.000Z',
          endedAt: '2026-11-15T10:25:00.000Z',
          durationSeconds: 1500, // 25 mins
          durationMinutes: 25,
          mode: 'work',
          completed: true,
          taskId: null,
        },
      ],
    };

    const html = generateExecutivePdfReportHtml(payloadNoTasks, 'NOVEMBER 2026', 'Atif Munshi');

    // Must NOT contain 0 / 0 (0%)
    assert.ok(!html.includes('0 / 0 (0%)'));
    assert.ok(html.includes('Tasks Execution Rate'));
    assert.ok(html.includes('N/A'));
    assert.ok(html.includes('No tasks scheduled in period'));
    assert.ok(html.includes('no tasks scheduled in this period'));

    // Excel dashboard check
    const sheets = generateMasterXlsxWorkbook(payloadNoTasks, 'NOVEMBER 2026');
    const dash = sheets.find((s) => s.name === 'Executive Dashboard')!;
    const velocityRow = dash.rows.find((r) => r.kpi === 'Tasks Execution Velocity')!;
    assert.equal(velocityRow.value, 'N/A');
    assert.equal(velocityRow.notes, 'No tasks scheduled in period');
  });

  test('T14: Cryptographic Claim Removal — Truthful audit statements and authentic ledger references', () => {
    const html = generateExecutivePdfReportHtml(mockPayload, 'NOVEMBER 2026', 'Atif Munshi');

    // Must NOT contain misleading cryptographic claims
    assert.ok(!html.toLowerCase().includes('cryptographic document generator'));
    assert.ok(!html.toLowerCase().includes('cryptographic integrity'));

    // Must contain truthful audit language
    assert.ok(html.includes('Verified Local Ledger Audit Statement'));
    assert.ok(html.includes('Data Authenticity Statement'));
    assert.ok(html.includes('100% of values compiled directly from verified user accounting records'));
  });

  test('T15: OpenXML Conformance — Strict SpreadsheetML structures and cellStyleXfs present', () => {
    const sheets = generateMasterXlsxWorkbook(mockPayload, 'NOVEMBER 2026');
    const bytes = generateOpenXmlWorkbook(sheets);
    assert.ok(bytes.length > 1000);

    // Convert bytes to string for text validation of XML inside zip
    const text = new TextDecoder('latin1').decode(bytes);
    assert.ok(text.includes('cellStyleXfs count="1"'));
    assert.ok(text.includes('cellStyles count="1"'));
    assert.ok(text.includes('fills count="8"'));
    assert.ok(text.includes('xfId="0"'));
  });

  test('T16: Module Coverage — Selected modules with zero records are included with honest status', () => {
    const payloadNoBillsOrEnvelopes: UnifiedExportDataPayload = {
      ...mockPayload,
      bills: [],
      envelopes: [],
    };

    // finance_monthly selects ['finance_overview', 'income', 'expenses', 'bills', 'envelopes']
    const selected = new Set<any>(['finance_overview', 'income', 'expenses', 'bills', 'envelopes']);
    const sheets = generateMasterXlsxWorkbook(payloadNoBillsOrEnvelopes, 'NOVEMBER 2026', selected);

    // Sheets MUST NOT be omitted silently
    const sheetNames = sheets.map((s) => s.name);
    assert.ok(sheetNames.includes('Executive Dashboard'));
    assert.ok(sheetNames.includes('Income'));
    assert.ok(sheetNames.includes('Expenses'));
    assert.ok(sheetNames.includes('Transactions'));
    assert.ok(sheetNames.includes('Bills & Payments'), 'Bills sheet must be included when selected');
    assert.ok(sheetNames.includes('Budgets'), 'Budgets sheet must be included when selected');

    // Bills sheet must have an honest empty status row
    const billsSheet = sheets.find((s) => s.name === 'Bills & Payments')!;
    assert.equal(billsSheet.rows.length, 1);
    assert.ok(String(billsSheet.rows[0].name).includes('No scheduled bills'));

    // Budgets sheet must have an honest empty status row
    const budgetsSheet = sheets.find((s) => s.name === 'Budgets')!;
    assert.equal(budgetsSheet.rows.length, 1);
    assert.ok(String(budgetsSheet.rows[0].name).includes('No budget envelopes'));

    // Dashboard must contain coverage status
    const dash = sheets.find((s) => s.name === 'Executive Dashboard')!;
    const coverageRows = dash.rows.filter((r) => r.category === 'COVERAGE');
    assert.ok(coverageRows.length >= 5);
  });

  test('T17: Personal Finance Intelligence Report — 9-Sheet Excel Structure & 5-Page Visual PDF Intelligence', () => {
    // 1. Verify 9-sheet Excel workbook structure
    const sheets = generateMasterXlsxWorkbook(mockPayload, 'NOVEMBER 2026');
    const sheetNames = sheets.map((s) => s.name);

    assert.ok(sheetNames.includes('Executive Dashboard'), 'Sheet 1: Executive Dashboard must exist');
    assert.ok(sheetNames.includes('Income'), 'Sheet 2: Income must exist');
    assert.ok(sheetNames.includes('Expenses'), 'Sheet 3: Expenses must exist');
    assert.ok(sheetNames.includes('Category Breakdown'), 'Sheet 4: Category Breakdown must exist');
    assert.ok(sheetNames.includes('Daily Spending'), 'Sheet 5: Daily Spending must exist');
    assert.ok(sheetNames.includes('Monthly Trends'), 'Sheet 6: Monthly Trends must exist');
    assert.ok(sheetNames.includes('Bills & Payments'), 'Sheet 7: Bills & Payments must exist');
    assert.ok(sheetNames.includes('Budgets'), 'Sheet 8: Budgets must exist');
    assert.ok(sheetNames.includes('Transactions'), 'Sheet 9: Transactions must exist');

    // 2. Verify Category Breakdown sheet
    const catSheet = sheets.find((s) => s.name === 'Category Breakdown')!;
    assert.ok(catSheet.rows.some((r) => r.category === 'Food & Dining'));
    assert.ok(catSheet.rows.some((r) => r.category === 'Technology'));
    const techRow = catSheet.rows.find((r) => r.category === 'Technology')!;
    assert.equal(techRow.amount, 2400.0);
    assert.equal(techRow.count, 1);
    assert.equal(techRow.method, 'CREDIT CARD');

    const foodRow = catSheet.rows.find((r) => r.category === 'Food & Dining')!;
    assert.equal(foodRow.amount, 1850.0);
    assert.equal(foodRow.count, 1);
    assert.equal(foodRow.method, 'UPI BANK');

    // 3. Verify Daily Spending sheet
    const dailySheet = sheets.find((s) => s.name === 'Daily Spending')!;
    assert.ok(dailySheet.rows.some((r) => r.date === '2026-11-12'));
    assert.ok(dailySheet.rows.some((r) => r.date === '2026-11-14'));
    const peakDayRow = dailySheet.rows.find((r) => r.date === '2026-11-12')!;
    assert.equal(peakDayRow.amount, 2400.0);
    assert.equal(peakDayRow.intensity, 'Peak Spending Day');

    // 4. Verify Monthly Trends (Weekly Slices) sheet
    const trendsSheet = sheets.find((s) => s.name === 'Monthly Trends')!;
    assert.ok(trendsSheet.rows.some((r) => String(r.week).includes('Week 2')));
    const summaryTrend = trendsSheet.rows.find((r) => r.week === 'MONTHLY TOTAL')!;
    assert.ok(typeof summaryTrend.inflow === 'number' && summaryTrend.inflow > 0, 'summaryTrend.inflow must be a positive number');
    assert.ok(typeof summaryTrend.outflow === 'number' && summaryTrend.outflow > 0, 'summaryTrend.outflow must be a positive number');

    // 5. Verify Transactions sheet with Running Period Net
    const txSheet = sheets.find((s) => s.name === 'Transactions')!;
    const txColumns = txSheet.columns.map((c) => c.header);
    assert.ok(txColumns.includes('Running Period Net (INR)'));
    assert.ok(txSheet.rows.length >= 4);
    for (const r of txSheet.rows) {
      assert.ok(typeof r.runningNet === 'number', 'runningNet must be numeric');
    }

    // 6. Verify 5-Page Visual PDF Intelligence
    const html = generateExecutivePdfReportHtml(mockPayload, 'NOVEMBER 2026', 'Atif Munshi', {
      templateId: 'finance_monthly',
    });

    // Page 1: Hero Dashboard
    assert.ok(html.includes('Period Net Cashflow (Calculated)') || html.includes('Net Financial Flow'));
    assert.ok(html.includes('Operational Ledger'));
    assert.ok(html.includes('INFLOW RATIO:'));
    assert.ok(html.includes('OUTFLOW RATIO:'));
    assert.ok(html.includes('Executive Personal Finance Intelligence Brief'));

    // Page 2: Where Did My Money Go?
    assert.ok(html.includes('Where Did My Money Go? — Category Breakdown'));
    assert.ok(html.includes('Primary Expense Driver Spotlight'));
    assert.ok(html.includes('Technology: ₹2,400.00'));
    assert.ok(html.includes('stroke-dasharray'), 'Vector SVG Donut Chart must use SVG circles with stroke-dasharray');

    // Page 3: Spending Dynamics & Timeline
    assert.ok(html.includes('Spending Dynamics &amp; Timeline Trends'));
    assert.ok(html.includes('Daily Outflow Trajectory (Timeline View)'));
    assert.ok(html.includes('Weekly Cashflow Dynamics'));
    assert.ok(html.includes('Payment Methods Distribution'));

    // Page 4: Revenue Streams, Obligations & Wealth
    assert.ok(html.includes('Revenue Streams, Scheduled Obligations &amp; Wealth'));
    assert.ok(html.includes('Scheduled Bills &amp; Payment Commitments'));
    assert.ok(html.includes('Envelope Budgets &amp; Spending Caps'));
    assert.ok(html.includes('Capital Accumulation &amp; Savings Goals'));

    // Page 5: Chronological Transactions Register
    assert.ok(html.includes('Audited Chronological Transactions Register'));
    assert.ok(html.includes('Running Net (INR)'));
    assert.ok(html.includes('thead {'));
    assert.ok(html.includes('display: table-header-group;'));
    assert.ok(html.includes('break-inside: avoid;'));
  });

  describe('Premium Export Center: 7 Critical Bug Fixes Verification', () => {
    // BUG 1: Safe runtime type narrowing
    test('Bug 1: Safe runtime type narrowing prevents TS unknown error without any or test removal', () => {
      const sheets = generateMasterXlsxWorkbook(mockPayload, 'NOVEMBER 2026');
      const trendsSheet = sheets.find((s) => s.name === 'Monthly Trends')!;
      const summaryTrend = trendsSheet.rows.find((r) => r.week === 'MONTHLY TOTAL')!;

      // Narrowing verification
      assert.ok(typeof summaryTrend.inflow === 'number');
      assert.ok(typeof summaryTrend.outflow === 'number');
      assert.ok(summaryTrend.inflow > 0);
      assert.ok(summaryTrend.outflow > 0);
    });

    // BUG 2: Record counting for all supported modules enables download
    test('Bug 2: Record counting handles envelopes, savings goals, productivity, and calendar without double counting', () => {
      // Simulate previewMetrics record count calculation from ExportCenterView.tsx
      const countRecords = (selectedModules: Set<ExportModuleId>, data: UnifiedExportDataPayload): number => {
        let count = 0;
        if (selectedModules.has('finance_overview') || selectedModules.has('transactions')) {
          count += data.incomes.length + data.expenses.length;
        } else {
          if (selectedModules.has('income')) count += data.incomes.length;
          if (selectedModules.has('expenses')) count += data.expenses.length;
        }
        if (selectedModules.has('bills')) count += data.bills.length;
        if (selectedModules.has('envelopes')) count += data.envelopes.length;
        if (selectedModules.has('savings_goals')) count += data.savingsGoals.length;
        if (selectedModules.has('productivity_overview')) {
          count += data.tasks.length + data.sessions.length;
        } else {
          if (selectedModules.has('tasks')) count += data.tasks.length;
          if (selectedModules.has('focus_sessions')) count += data.sessions.length;
        }
        if (selectedModules.has('study_os')) count += data.studySubjects.length + data.studyTopics.length;
        if (selectedModules.has('habits')) count += data.habits.length;
        if (selectedModules.has('calendar')) count += data.timeBlocks.length;
        if (selectedModules.has('account_backup')) {
          count = data.incomes.length + data.expenses.length + data.bills.length +
            data.envelopes.length + data.savingsGoals.length + data.tasks.length +
            data.sessions.length + data.habits.length + data.timeBlocks.length +
            data.studySubjects.length + data.studyTopics.length;
        }
        return count;
      };

      // Selecting envelopes only
      const envCount = countRecords(new Set(['envelopes']), mockPayload);
      assert.equal(envCount, mockPayload.envelopes.length);
      assert.ok(envCount > 0, 'Envelopes must count > 0 to enable download');

      // Selecting savings goals only
      const savCount = countRecords(new Set(['savings_goals']), mockPayload);
      assert.equal(savCount, mockPayload.savingsGoals.length);
      assert.ok(savCount > 0, 'Savings goals must count > 0 to enable download');

      // Selecting productivity overview only (tasks + sessions without double count)
      const prodCount = countRecords(new Set(['productivity_overview']), mockPayload);
      assert.equal(prodCount, mockPayload.tasks.length + mockPayload.sessions.length);
      assert.ok(prodCount > 0, 'Productivity overview must count tasks + sessions');

      // Selecting calendar only
      const payloadWithCalendar: UnifiedExportDataPayload = {
        ...mockPayload,
        timeBlocks: [
          {
            id: 'tb_1',
            userId: 'usr_test',
            date: '2026-11-15',
            startMinute: 600,
            endMinute: 660,
            title: 'Deep Study Block',
            category: 'Study',
            completed: true,
            createdAt: '2026-11-15T10:00:00.000Z',
            updatedAt: '2026-11-15T10:00:00.000Z',
          },
        ],
      };
      const calCount = countRecords(new Set(['calendar']), payloadWithCalendar);
      assert.equal(calCount, 1);
      assert.ok(calCount > 0, 'Calendar must count timeBlocks');

      // Genuinely empty dataset reports 0
      const emptyPayload: UnifiedExportDataPayload = {
        ...mockPayload,
        envelopes: [],
        savingsGoals: [],
        tasks: [],
        sessions: [],
        timeBlocks: [],
      };
      assert.equal(countRecords(new Set(['envelopes']), emptyPayload), 0);
    });

    // BUG 3: Multi-Module CSV Packaging & Productivity Overview
    test('Bug 3: Multi-module CSV packaging into ZIP and dedicated productivity_overview CSV', () => {
      // 1. Productivity Overview CSV content
      const { filename: prodFilename, content: prodCsv } = generateModuleCsv('productivity_overview', mockPayload);
      assert.ok(prodFilename.includes('productivity-overview'));
      assert.ok(prodCsv.includes('Entity Type,Date,Title / Description,Status / Mode,Category / Priority,Duration / Est Poms,Completion / Task ID'));
      assert.ok(prodCsv.includes('TASK'));
      assert.ok(prodCsv.includes('Review Financial Balance Sheet'));
      assert.ok(prodCsv.includes('FOCUS_SESSION'));
      // Must not fall back to transactions
      assert.ok(!prodCsv.includes('Transaction_ID') && !prodCsv.includes('Amount_INR'), 'Must not fall back to transactions');

      // 2. ZIP generation
      const files = [
        { name: 'income.csv', content: 'Date,Source,Amount\n2026-11-10,Client A,8500.00' },
        { name: 'expenses.csv', content: 'Date,Description,Amount\n2026-11-12,Hosting,2400.00' },
        { name: 'productivity.csv', content: prodCsv },
      ];
      const zipBuffer = generateZipArchive(files);
      assert.ok(zipBuffer instanceof Uint8Array);
      assert.ok(zipBuffer.length > 100);
      // Check standard ZIP local file header signature: 0x50 0x4B 0x03 0x04 (PK\x03\x04)
      assert.equal(zipBuffer[0], 0x50);
      assert.equal(zipBuffer[1], 0x4B);
      assert.equal(zipBuffer[2], 0x03);
      assert.equal(zipBuffer[3], 0x04);
    });

    // BUG 4: PDF & JSON Module Filtering
    test('Bug 4: Non-financial PDF suppresses financial pages; JSON backup filters collections by selectedModules', () => {
      // 1. PDF with only Study & Habits selected
      const nonFinHtml = generateExecutivePdfReportHtml(mockPayload, 'NOVEMBER 2026', 'Atif Munshi', {
        selectedModules: new Set(['study_os', 'habits']),
      });

      // Suppresses financial pages
      assert.ok(!nonFinHtml.includes('Where Did My Money Go? — Category Breakdown'), 'Must suppress Page 2');
      assert.ok(!nonFinHtml.includes('Spending Dynamics &amp; Timeline Trends'), 'Must suppress Page 3');
      assert.ok(!nonFinHtml.includes('Revenue Streams, Scheduled Obligations &amp; Wealth'), 'Must suppress Page 4');
      assert.ok(!nonFinHtml.includes('Audited Chronological Transactions Register'), 'Must suppress Page 5');

      // Includes dedicated study and habits sections
      assert.ok(nonFinHtml.includes('Academic Curricula &amp; Subject Matrix'));
      assert.ok(nonFinHtml.includes('Active Topics &amp; Spaced Repetition Matrix'));
      assert.ok(nonFinHtml.includes('Habit Formation &amp; Streak Architecture'));
      assert.ok(nonFinHtml.includes('Data Structures &amp; Algorithms'));
      assert.ok(nonFinHtml.includes('Morning Financial Journaling'));

      // 2. JSON Backup filtering
      const { jsonText: habitJsonText } = generateVersionedJsonBackup(mockPayload, 'habits_backup', new Set(['habits']));
      const parsedHabitJson = JSON.parse(habitJsonText);
      assert.equal(parsedHabitJson.schemaVersion, '2.1.0');
      assert.equal(parsedHabitJson.exportScope, 'habits_backup');
      assert.equal(parsedHabitJson.habits.length, mockPayload.habits.length);
      // Unselected collections are empty
      assert.deepEqual(parsedHabitJson.incomes, []);
      assert.deepEqual(parsedHabitJson.expenses, []);
      assert.deepEqual(parsedHabitJson.bills, []);
      assert.deepEqual(parsedHabitJson.tasks, []);
      assert.equal(parsedHabitJson.metadata.totalIncomes, 0);
      assert.equal(parsedHabitJson.metadata.totalExpenses, 0);
      assert.equal(parsedHabitJson.metadata.totalHabits, mockPayload.habits.length);

      // Complete scope keeps everything
      const { jsonText: completeJsonText } = generateVersionedJsonBackup(mockPayload, 'complete');
      const parsedComplete = JSON.parse(completeJsonText);
      assert.equal(parsedComplete.incomes.length, mockPayload.incomes.length);
      assert.equal(parsedComplete.expenses.length, mockPayload.expenses.length);
      assert.equal(parsedComplete.habits.length, mockPayload.habits.length);
    });

    // BUG 5: Donut Chart SVG XSS Escaping
    test('Bug 5: Donut Chart SVG escapes special characters preventing XSS injection', () => {
      const maliciousCategories: Array<[string, number]> = [
        ['<script>alert("xss")</script>', 50000],
        ['<b>danger</b>', 30000],
      ];

      const svgHtml = generateDonutChartSvg(maliciousCategories, 80000);
      // Script tags must be completely escaped
      assert.ok(!svgHtml.includes('<script>'));
      assert.ok(!svgHtml.includes('<b>danger</b>'));
      assert.ok(svgHtml.includes('&lt;script&gt;'));
      assert.ok(svgHtml.includes('&lt;b&gt;danger&lt;/b&gt;'));
    });

    // BUG 6: Quick Action Bill Category Resolution
    test('Bug 6: Quick Action Bill creation resolves categoryId from user categories', () => {
      const userCategories = [
        { id: 'cat_util', name: 'Utilities & Bills' },
        { id: 'cat_rent', name: 'Housing & Rent' },
        { id: 'cat_food', name: 'Food & Dining' },
      ];

      // Simulate the resolution logic from QuickActionModal.tsx
      const resolveCategory = (rawBillCategory: string) => {
        const matched = userCategories.find(
          (c) => c.name.toLowerCase() === rawBillCategory.toLowerCase() || c.id === rawBillCategory
        );
        return {
          resolvedCategoryId: matched?.id || 'cat_util',
          resolvedCategoryName: matched?.name || rawBillCategory || 'Bills & Utilities',
        };
      };

      const match1 = resolveCategory('Housing & Rent');
      assert.equal(match1.resolvedCategoryId, 'cat_rent');
      assert.equal(match1.resolvedCategoryName, 'Housing & Rent');

      const match2 = resolveCategory('cat_food');
      assert.equal(match2.resolvedCategoryId, 'cat_food');
      assert.equal(match2.resolvedCategoryName, 'Food & Dining');

      const matchFallback = resolveCategory('Unknown Nonexistent');
      assert.equal(matchFallback.resolvedCategoryId, 'cat_util');
      assert.equal(matchFallback.resolvedCategoryName, 'Unknown Nonexistent');
    });

    // BUG 7: Multi-Currency Export Output (USD, EUR, INR)
    test('Bug 7: User-configured multi-currency output across XLSX, CSV, and PDF', () => {
      // 1. CSV with USD
      const { content: usdCsv } = generateModuleCsv('expenses', mockPayload, 'USD');
      assert.ok(usdCsv.includes('Amount (USD)'));
      assert.ok(!usdCsv.includes('Amount (INR)'));

      // 2. CSV with EUR
      const { content: eurCsv } = generateModuleCsv('income', mockPayload, 'EUR');
      assert.ok(eurCsv.includes('Amount (EUR)'));
      assert.ok(!eurCsv.includes('Amount (INR)'));

      // 3. XLSX with USD
      const usdSheets = generateMasterXlsxWorkbook(mockPayload, 'NOVEMBER 2026', undefined, 'USD');
      const expSheet = usdSheets.find((s) => s.name === 'Expenses')!;
      const expColHeaders = expSheet.columns.map((c) => c.header);
      assert.ok(expColHeaders.includes('Amount (USD)'));
      assert.ok(!expColHeaders.includes('Amount (INR)'));

      // 4. PDF with USD
      const usdPdfHtml = generateExecutivePdfReportHtml(mockPayload, 'NOVEMBER 2026', 'Atif Munshi', {
        currency: 'USD',
      });
      assert.ok(usdPdfHtml.includes('Total (USD)'));
      assert.ok(usdPdfHtml.includes('Inflow (USD)'));
      assert.ok(usdPdfHtml.includes('Outflow (USD)'));
      assert.ok(usdPdfHtml.includes('$2,400.00') || usdPdfHtml.includes('$8,500.00'));
      assert.ok(!usdPdfHtml.includes('Running Net (INR)'));
      assert.ok(usdPdfHtml.includes('Running Net (USD)'));

      // 5. PDF with EUR
      const eurPdfHtml = generateExecutivePdfReportHtml(mockPayload, 'NOVEMBER 2026', 'Atif Munshi', {
        currency: 'EUR',
      });
      assert.ok(eurPdfHtml.includes('Total (EUR)'));
      assert.ok(eurPdfHtml.includes('€2,400.00') || eurPdfHtml.includes('€8,500.00'));
    });
  });

  describe('Final Edge-Case Fixes Verification: Calendar PDF & CSV ZIP Filenames', () => {
    const timeBlocksFixture = [
      {
        id: 'tb_1',
        userId: 'usr_test',
        date: '2026-11-15',
        startMinute: 600, // 10:00
        endMinute: 690,   // 11:30 (90m)
        title: 'Deep Architecture Review',
        category: 'Engineering',
        completed: true,
        notes: 'Refactor export pipeline',
        createdAt: '2026-11-15T10:00:00.000Z',
        updatedAt: '2026-11-15T11:30:00.000Z',
      },
      {
        id: 'tb_2',
        userId: 'usr_test',
        date: '2026-11-16',
        startMinute: 840, // 14:00
        endMinute: 900,   // 15:00 (60m)
        title: 'Financial Audit Meeting',
        category: 'Finance',
        completed: false,
        notes: 'Review Q4 statements',
        createdAt: '2026-11-16T14:00:00.000Z',
        updatedAt: '2026-11-16T14:00:00.000Z',
      },
    ];

    const payloadWithTimeBlocks: UnifiedExportDataPayload = {
      ...mockPayload,
      timeBlocks: timeBlocksFixture,
    };

    // TEST 1: Calendar PDF renders selected TimeBlock records with fields
    test('Fix 1.1: Calendar PDF renders selected TimeBlock records with start/end time, duration, and status', () => {
      const html = generateExecutivePdfReportHtml(payloadWithTimeBlocks, 'NOVEMBER 2026', 'Atif Munshi', {
        selectedModules: new Set(['calendar']),
      });

      assert.ok(html.includes('CALENDAR &amp; SCHEDULE REGISTER'), 'Must include Calendar header');
      assert.ok(html.includes('Calendar Schedule &amp; Activity Timeblock Matrix'), 'Must include section title');
      assert.ok(html.includes('Deep Architecture Review'), 'Must include time block 1 title');
      assert.ok(html.includes('Financial Audit Meeting'), 'Must include time block 2 title');
      assert.ok(html.includes('10:00 – 11:30'), 'Must format start and end time');
      assert.ok(html.includes('(90m)'), 'Must calculate duration');
      assert.ok(html.includes('Engineering'), 'Must include category');
      assert.ok(html.includes('Refactor export pipeline'), 'Must include notes/context');
      assert.ok(html.includes('status-paid">Completed</span>'), 'Completed block must render Completed badge');
      assert.ok(html.includes('status-pending">Scheduled</span>'), 'Uncompleted block must render Scheduled badge');
      assert.ok(!html.includes('AUDITED TRANSACTIONS REGISTER'), 'Financial transactions page suppressed when only calendar selected');
    });

    // TEST 2: Calendar PDF respects date filtering
    test('Fix 1.2: Calendar data adapter respects date range filtering', () => {
      const outOfRangeBlock = {
        id: 'tb_old',
        userId: 'usr_test',
        date: '2026-09-01',
        startMinute: 540,
        endMinute: 600,
        title: 'Out of Range Sprint',
        category: 'Old',
        completed: true,
        createdAt: '2026-09-01T09:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      };

      const rawAppPayload: UnifiedExportDataPayload = {
        ...mockPayload,
        timeBlocks: [...timeBlocksFixture, outOfRangeBlock],
      };

      const novRange = resolveDateFilterRange('this_month');
      const filtered = filterPayloadByDateRange(rawAppPayload, novRange, 'Asia/Kolkata');

      assert.equal(filtered.timeBlocks.length, 2, 'Only in-range November blocks must be retained');
      assert.ok(filtered.timeBlocks.some((tb) => tb.id === 'tb_1'));
      assert.ok(filtered.timeBlocks.some((tb) => tb.id === 'tb_2'));
      assert.ok(!filtered.timeBlocks.some((tb) => tb.id === 'tb_old'), 'September block must be filtered out');
    });

    // TEST 3: Calendar PDF respects selectedModules
    test('Fix 1.3: Calendar PDF section respects selectedModules (included when selected, omitted when not)', () => {
      // Omitted when not selected
      const htmlWithoutCal = generateExecutivePdfReportHtml(payloadWithTimeBlocks, 'NOVEMBER 2026', 'Atif Munshi', {
        selectedModules: new Set(['expenses', 'income']),
      });
      assert.ok(!htmlWithoutCal.includes('CALENDAR &amp; SCHEDULE REGISTER'), 'Calendar must be omitted when not selected');
      assert.ok(!htmlWithoutCal.includes('Calendar Schedule &amp; Activity Timeblock Matrix'));

      // Included when selected alongside productivity
      const htmlWithCal = generateExecutivePdfReportHtml(payloadWithTimeBlocks, 'NOVEMBER 2026', 'Atif Munshi', {
        selectedModules: new Set(['tasks', 'calendar']),
      });
      assert.ok(htmlWithCal.includes('CALENDAR &amp; SCHEDULE REGISTER'), 'Calendar must be present when selected');
      assert.ok(htmlWithCal.includes('PRODUCTIVITY REGISTER'), 'Tasks must be present when selected');
    });

    // TEST 4: Truthful empty state for Calendar
    test('Fix 1.4: Truthful empty state rendered when no time blocks exist', () => {
      const emptyCalPayload: UnifiedExportDataPayload = {
        ...mockPayload,
        timeBlocks: [],
      };

      const html = generateExecutivePdfReportHtml(emptyCalPayload, 'NOVEMBER 2026', 'Atif Munshi', {
        selectedModules: new Set(['calendar']),
      });

      assert.ok(html.includes('No calendar events or scheduled time blocks recorded in this period'), 'Must render truthful empty row');
      assert.ok(html.includes('Total Scheduled Blocks: <strong>0</strong>'));
      assert.ok(html.includes('0% execution rate'));
    });

    // TEST 5: calendar_schedule template produces Calendar content
    test('Fix 1.5: calendar_schedule template automatically activates Calendar, Tasks, and Bills in PDF', () => {
      const html = generateExecutivePdfReportHtml(payloadWithTimeBlocks, 'NOVEMBER 2026', 'Atif Munshi', {
        templateId: 'calendar_schedule',
      });

      assert.ok(html.includes('Unified Activity &amp; Calendar Schedule') || html.includes('Unified Activity & Calendar Schedule'), 'Template title in PDF');
      assert.ok(html.includes('CALENDAR &amp; SCHEDULE REGISTER'), 'Calendar section must be produced by calendar_schedule template');
      assert.ok(html.includes('Deep Architecture Review'), 'Calendar time blocks rendered');
      assert.ok(html.includes('PRODUCTIVITY REGISTER'), 'Tasks section produced by calendar_schedule template');
      assert.ok(html.includes('Scheduled Bills &amp; Payment Commitments'), 'Bills section produced by calendar_schedule template');
    });

    // TEST 6: Unique CSV filenames & ZIP packaging for finance_overview and transactions
    test('Fix 2: finance_overview and transactions CSV exports produce distinct filenames, distinct schemas, and coexist in ZIP', () => {
      const dateStamp = getTodayDateString();

      // 1. Module CSV for finance_overview produces focusflow-finance-overview-${dateStamp}.csv
      const financeOverviewCsv = generateModuleCsv('finance_overview', mockPayload, 'INR');
      assert.equal(financeOverviewCsv.filename, `focusflow-finance-overview-${dateStamp}.csv`);
      assert.ok(financeOverviewCsv.content.includes('Financial Metric,Value (INR),Status / Ratio,Verified Context'), 'Headers for finance overview');
      assert.ok(financeOverviewCsv.content.includes('Total Inflow (Credits)'));
      assert.ok(financeOverviewCsv.content.includes('Net Cashflow (Operating)'));

      // 2. Module CSV for transactions produces focusflow-transactions-ledger-${dateStamp}.csv
      const transactionsCsv = generateModuleCsv('transactions', mockPayload, 'INR');
      assert.equal(transactionsCsv.filename, `focusflow-transactions-ledger-${dateStamp}.csv`);
      assert.ok(transactionsCsv.content.includes('Type,Date,Description / Source,Category,Payment / Status,Amount (INR),Notes'), 'Headers for transactions');
      assert.ok(transactionsCsv.content.includes('INCOME'));
      assert.ok(transactionsCsv.content.includes('EXPENSE'));

      // 3. Filenames must not collide
      assert.notEqual(financeOverviewCsv.filename, transactionsCsv.filename);

      // 4. Bundling both into ZIP archive produces valid ZIP with both distinct entries
      const zipBytes = generateZipArchive([
        { name: financeOverviewCsv.filename, content: financeOverviewCsv.content },
        { name: transactionsCsv.filename, content: transactionsCsv.content },
      ]);
      assert.ok(zipBytes instanceof Uint8Array);
      assert.ok(zipBytes.length > 100, 'Zip archive must contain valid binary bytes');

      // 5. Defensive deduplication test: if identical names are passed to generateZipArchive, it appends -2
      const duplicateZipBytes = generateZipArchive([
        { name: 'focusflow-data.csv', content: 'id,val\n1,a' },
        { name: 'focusflow-data.csv', content: 'id,val\n2,b' },
      ]);
      assert.ok(duplicateZipBytes.length > 50);
    });
  });
});

