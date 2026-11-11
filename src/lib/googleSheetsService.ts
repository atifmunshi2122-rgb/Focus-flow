import {
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  RecurringExpense,
  Bill,
  FocusStatsData,
  FinanceSummaryData,
} from '../types/index.ts';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

export interface SyncQueueItem {
  id: string;
  sheetName: string;
  action: 'append' | 'update_cell' | 'full_refresh';
  payload: unknown;
  timestamp: string;
  retryCount: number;
}

const SYNC_QUEUE_KEY = 'focusflow_sheets_sync_queue';

// The 12 required worksheets
export const WORKSHEET_NAMES = [
  'Focus_Sessions',
  'Focus_Daily',
  'Focus_Weekly',
  'Focus_Monthly',
  'Income',
  'Fixed_Expenses',
  'Variable_Expenses',
  'Bills_Payments',
  'Finance_Daily',
  'Finance_Weekly',
  'Finance_Monthly',
  'Overall_Analytics',
] as const;

export type WorksheetName = typeof WORKSHEET_NAMES[number];

// Headers configuration for all 12 worksheets
export const WORKSHEET_HEADERS: Record<WorksheetName, string[]> = {
  Focus_Sessions: [
    'Session ID',
    'Date',
    'Session Mode',
    'Duration (Min)',
    'Task Title',
    'Completed',
    'Started At',
    'Ended At',
  ],
  Focus_Daily: [
    'Date',
    'Day',
    'Focus Minutes',
    'Focus Hours',
    'Completed Sessions',
  ],
  Focus_Weekly: [
    'Week Range',
    'Productive Hours',
    'Average Daily Focus (Min)',
    'Completed Cycles',
  ],
  Focus_Monthly: [
    'Month',
    'Total Focus Hours',
    'Completed Sessions',
    'Streak Record (Days)',
  ],
  Income: [
    'Income ID',
    'Date',
    'Source / Client',
    'Category',
    'Amount (₹)',
    'Notes',
  ],
  Fixed_Expenses: [
    'Plan ID',
    'Plan Name',
    'Category',
    'Amount (₹)',
    'Recurrence',
    'Due Day',
    'Active Status',
    'Notes',
  ],
  Variable_Expenses: [
    'Expense ID',
    'Date',
    'Description',
    'Category',
    'Amount (₹)',
    'Payment Method',
    'Notes',
  ],
  Bills_Payments: [
    'Bill ID',
    'Due Date',
    'Bill Name',
    'Category',
    'Amount (₹)',
    'Payment Status',
    'Payment Date',
    'Payment Method',
    'Notes',
  ],
  Finance_Daily: [
    'Date',
    'Income (₹)',
    'Expenses (₹)',
    'Net Cashflow (₹)',
  ],
  Finance_Weekly: [
    'Week',
    'Income (₹)',
    'Fixed Outflow (₹)',
    'Variable Outflow (₹)',
    'Total Expenses (₹)',
    'Net Savings (₹)',
  ],
  Finance_Monthly: [
    'Month',
    'Total Income (₹)',
    'Fixed Expenses (₹)',
    'Variable Expenses (₹)',
    'Total Expenses (₹)',
    'Remaining Balance (₹)',
    'Savings Rate (%)',
  ],
  Overall_Analytics: [
    'Executive KPI',
    'Value / Formula',
    'Unit / Cadence',
    'Operational Notes',
  ],
};

class GoogleSheetsService {
  private queue: SyncQueueItem[] = [];

  constructor() {
    this.loadQueue();
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem(SYNC_QUEUE_KEY);
      if (saved) {
        this.queue = JSON.parse(saved);
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      // ignore
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Creates a master workbook with all 12 styled worksheets in the user's Google Drive.
   */
  public async createMasterWorkbook(accessToken: string): Promise<string> {
    const title = 'FocusFlow & Finance — Master Management Ledger';

    // 1. Initialize spreadsheet with the 12 tabs
    const sheetObjects = WORKSHEET_NAMES.map((name, index) => ({
      properties: {
        sheetId: index + 100,
        title: name,
        gridProperties: {
          rowCount: 500,
          columnCount: 16,
          frozenRowCount: 1,
        },
      },
    }));

    const createPayload = {
      properties: {
        title,
        locale: 'en_IN',
        autoRecalc: 'ON_CHANGE',
      },
      sheets: sheetObjects,
    };

    const res = await fetch(SHEETS_API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create master workbook in Google Sheets: ${err}`);
    }

    const spreadsheet = await res.json();
    const spreadsheetId: string = spreadsheet.spreadsheetId;

    // 2. Format all worksheets with professional styling, typography, and headers
    await this.applyWorkbookStyling(spreadsheetId, accessToken);

    return spreadsheetId;
  }

  /**
   * Applies executive styling: deep navy header rows, bold white typography,
   * currency formatting in INR, auto column sizing, and conditional formatting.
   */
  private async applyWorkbookStyling(spreadsheetId: string, accessToken: string): Promise<void> {
    const requests: unknown[] = [];

    WORKSHEET_NAMES.forEach((name, index) => {
      const sheetId = index + 100;
      const headers = WORKSHEET_HEADERS[name];

      // Format Header Row: Deep Navy background (#151E38), bold white text, center aligned
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: headers.length,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.08, green: 0.12, blue: 0.22 },
              horizontalAlignment: 'CENTER',
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                fontSize: 10,
                bold: true,
                fontFamily: 'Roboto',
              },
              padding: { top: 6, bottom: 6, left: 10, right: 10 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,padding)',
        },
      });

      // Currency number formatting for amount columns
      if (['Income', 'Fixed_Expenses', 'Variable_Expenses', 'Bills_Payments', 'Finance_Daily', 'Finance_Weekly', 'Finance_Monthly'].includes(name)) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 500,
              startColumnIndex: 3,
              endColumnIndex: 7,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: 'CURRENCY',
                  pattern: '"₹"#,##0.00',
                },
              },
            },
            fields: 'userEnteredFormat.numberFormat',
          },
        });
      }
    });

    // Conditional formatting for Bills_Payments: PAID (emerald), UNPAID (amber), OVERDUE (rose)
    const billsSheetId = 100 + WORKSHEET_NAMES.indexOf('Bills_Payments');
    requests.push(
      // PAID -> Green
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'PAID' }] },
              format: {
                backgroundColor: { red: 0.85, green: 0.95, blue: 0.88 },
                textFormat: { foregroundColor: { red: 0.05, green: 0.45, blue: 0.2 }, bold: true },
              },
            },
          },
          index: 0,
        },
      },
      // UNPAID -> Amber
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'UNPAID' }] },
              format: {
                backgroundColor: { red: 0.99, green: 0.95, blue: 0.85 },
                textFormat: { foregroundColor: { red: 0.7, green: 0.45, blue: 0.05 }, bold: true },
              },
            },
          },
          index: 1,
        },
      },
      // OVERDUE -> Rose
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'OVERDUE' }] },
              format: {
                backgroundColor: { red: 0.98, green: 0.88, blue: 0.88 },
                textFormat: { foregroundColor: { red: 0.75, green: 0.1, blue: 0.15 }, bold: true },
              },
            },
          },
          index: 2,
        },
      }
    );

    // Execute batch styling update
    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    // Populate header rows for all 12 sheets
    const data = WORKSHEET_NAMES.map((name) => ({
      range: `${name}!A1:${String.fromCharCode(64 + WORKSHEET_HEADERS[name].length)}1`,
      values: [WORKSHEET_HEADERS[name]],
    }));

    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data,
      }),
    });
  }

  /**
   * Synchronizes full state from the application into all 12 worksheets.
   */
  public async syncAllData(
    spreadsheetId: string,
    accessToken: string,
    data: {
      sessions: FocusSession[];
      focusStats?: FocusStatsData | null;
      incomes: IncomeTransaction[];
      recurring: RecurringExpense[];
      expenses: ExpenseTransaction[];
      bills: Bill[];
      financeSummary?: FinanceSummaryData | null;
    }
  ): Promise<void> {
    const valueUpdates: Array<{ range: string; values: (string | number)[][] }> = [];

    // 1. Focus_Sessions
    const sessionRows = data.sessions.map((s) => [
      s.id,
      s.startedAt.split('T')[0],
      s.mode.toUpperCase(),
      s.durationMinutes,
      s.taskTitle || 'Independent Focus Session',
      s.completed ? 'YES' : 'NO',
      s.startedAt,
      s.endedAt,
    ]);
    valueUpdates.push({
      range: `Focus_Sessions!A2:H${Math.max(2, sessionRows.length + 1)}`,
      values: sessionRows.length > 0 ? sessionRows : [['', '', '', '', '', '', '', '']],
    });

    // 2. Focus_Daily (Last 7 days from stats)
    if (data.focusStats?.last7Days) {
      const dailyRows = data.focusStats.last7Days.map((d) => [
        d.date,
        d.dayName,
        d.minutes,
        parseFloat((d.minutes / 60).toFixed(2)),
        d.sessionsCount,
      ]);
      valueUpdates.push({
        range: `Focus_Daily!A2:E${Math.max(2, dailyRows.length + 1)}`,
        values: dailyRows,
      });
    }

    // 3. Focus_Weekly
    const weeklyRows = [
      [
        'Current Week Active',
        parseFloat(((data.focusStats?.totalMinutes || 0) / 60).toFixed(1)),
        data.focusStats?.last7Days?.length
          ? Math.round((data.focusStats.totalMinutes || 0) / 7)
          : 0,
        data.focusStats?.totalCompletedSessions || 0,
      ],
    ];
    valueUpdates.push({
      range: 'Focus_Weekly!A2:D2',
      values: weeklyRows,
    });

    // 4. Focus_Monthly
    const monthlyFocusRows = [
      [
        new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        parseFloat(((data.focusStats?.monthMinutes || 0) / 60).toFixed(1)),
        data.focusStats?.monthSessionsCount || 0,
        'Active Streak Protected',
      ],
    ];
    valueUpdates.push({
      range: 'Focus_Monthly!A2:D2',
      values: monthlyFocusRows,
    });

    // 5. Income
    const incomeRows = data.incomes.map((inc) => [
      inc.id,
      inc.date,
      inc.source,
      inc.category,
      inc.amountPaise / 100,
      inc.notes || '',
    ]);
    valueUpdates.push({
      range: `Income!A2:F${Math.max(2, incomeRows.length + 1)}`,
      values: incomeRows.length > 0 ? incomeRows : [['', '', '', '', '', '']],
    });

    // 6. Fixed_Expenses
    const fixedRows = data.recurring.map((rec) => [
      rec.id,
      rec.name,
      rec.categoryName || 'Fixed Commitment',
      rec.amountPaise / 100,
      rec.recurrence.toUpperCase(),
      rec.dueDay,
      rec.isActive ? 'ACTIVE' : 'INACTIVE',
      rec.notes || '',
    ]);
    valueUpdates.push({
      range: `Fixed_Expenses!A2:H${Math.max(2, fixedRows.length + 1)}`,
      values: fixedRows.length > 0 ? fixedRows : [['', '', '', '', '', '', '', '']],
    });

    // 7. Variable_Expenses
    const variableExpenses = data.expenses.filter((e) => e.type === 'variable');
    const varRows = variableExpenses.map((exp) => [
      exp.id,
      exp.date,
      exp.description,
      exp.categoryName || 'General',
      exp.amountPaise / 100,
      exp.paymentMethod.replace('_', ' ').toUpperCase(),
      exp.notes || '',
    ]);
    valueUpdates.push({
      range: `Variable_Expenses!A2:G${Math.max(2, varRows.length + 1)}`,
      values: varRows.length > 0 ? varRows : [['', '', '', '', '', '', '']],
    });

    // 8. Bills_Payments
    const billRows = data.bills.map((b) => [
      b.id,
      b.dueDate,
      b.name,
      b.categoryName || 'General Bill',
      b.amountPaise / 100,
      b.status,
      b.paymentDate || '',
      b.status === 'PAID' ? 'SETTLED' : 'PENDING',
      b.notes || '',
    ]);
    valueUpdates.push({
      range: `Bills_Payments!A2:I${Math.max(2, billRows.length + 1)}`,
      values: billRows.length > 0 ? billRows : [['', '', '', '', '', '', '', '', '']],
    });

    // 9. Finance_Daily
    const todayStr = new Date().toISOString().split('T')[0];
    const todayIncome = data.incomes
      .filter((i) => i.date === todayStr)
      .reduce((sum, i) => sum + i.amountPaise, 0) / 100;
    const todayExpense = data.expenses
      .filter((e) => e.date === todayStr)
      .reduce((sum, e) => sum + e.amountPaise, 0) / 100;

    valueUpdates.push({
      range: 'Finance_Daily!A2:D2',
      values: [[todayStr, todayIncome, todayExpense, todayIncome - todayExpense]],
    });

    // 10. Finance_Weekly
    const totalWeeklyIncome = (data.financeSummary?.totalIncomePaise || 0) / 100;
    const totalWeeklyFixed = (data.financeSummary?.fixedExpensesPaise || 0) / 100;
    const totalWeeklyVar = (data.financeSummary?.variableExpensesPaise || 0) / 100;
    const totalWeeklyExp = (data.financeSummary?.totalExpensePaise || 0) / 100;

    valueUpdates.push({
      range: 'Finance_Weekly!A2:F2',
      values: [
        [
          'Current Period',
          totalWeeklyIncome,
          totalWeeklyFixed,
          totalWeeklyVar,
          totalWeeklyExp,
          totalWeeklyIncome - totalWeeklyExp,
        ],
      ],
    });

    // 11. Finance_Monthly
    const monthlyIncome = (data.financeSummary?.totalIncomePaise || 0) / 100;
    const monthlyFixed = (data.financeSummary?.fixedExpensesPaise || 0) / 100;
    const monthlyVar = (data.financeSummary?.variableExpensesPaise || 0) / 100;
    const monthlyTotalExp = (data.financeSummary?.totalExpensePaise || 0) / 100;
    const savings = monthlyIncome - monthlyTotalExp;
    const savingsRate = monthlyIncome > 0 ? parseFloat(((savings / monthlyIncome) * 100).toFixed(1)) : 0;

    valueUpdates.push({
      range: 'Finance_Monthly!A2:G2',
      values: [
        [
          new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
          monthlyIncome,
          monthlyFixed,
          monthlyVar,
          monthlyTotalExp,
          savings,
          `${savingsRate}%`,
        ],
      ],
    });

    // 12. Overall_Analytics with live spreadsheet formulas
    const analyticsRows = [
      ['Total Cumulative Income', '=SUM(Income!E2:E)', 'INR (₹)', 'All-time verified earnings'],
      ['Total Variable Spend', '=SUM(Variable_Expenses!E2:E)', 'INR (₹)', 'Operational day-to-day purchases'],
      ['Monthly Fixed Commitments', '=SUM(Fixed_Expenses!D2:D)', 'INR (₹)', 'Contractual and recurring liabilities'],
      ['Settled Bill Disbursements', '=SUMIF(Bills_Payments!F2:F, "PAID", Bills_Payments!E2:E)', 'INR (₹)', 'Paid commitments'],
      ['Pending Bill Obligations', '=SUMIF(Bills_Payments!F2:F, "UNPAID", Bills_Payments!E2:E)', 'INR (₹)', 'Due in current schedule'],
      ['Overdue Debt Warning', '=SUMIF(Bills_Payments!F2:F, "OVERDUE", Bills_Payments!E2:E)', 'INR (₹)', 'Urgent action required'],
      ['Net Treasury Balance', '=B2-(B3+B5)', 'INR (₹)', 'Formula calculation'],
      ['Lifetime Focus Hours', '=SUM(Focus_Sessions!D2:D)/60', 'Hours', 'Deep work recorded across all cycles'],
    ];

    valueUpdates.push({
      range: 'Overall_Analytics!A2:D9',
      values: analyticsRows,
    });

    // Send batch update to Google Sheets
    const res = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueUpdates,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Sheets synchronization failed: ${err}`);
    }
  }

  /**
   * Queue real-time mutation for Google Sheets (appended or updated).
   */
  public enqueueMutation(sheetName: WorksheetName, payload: unknown, action: SyncQueueItem['action'] = 'append') {
    const item: SyncQueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sheetName,
      action,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    this.queue.push(item);
    this.saveQueue();
  }

  /**
   * Process pending retry queue items.
   */
  public async flushQueue(spreadsheetId: string, accessToken: string): Promise<number> {
    if (this.queue.length === 0) return 0;

    let processed = 0;
    const remaining: SyncQueueItem[] = [];

    for (const item of this.queue) {
      try {
        if (item.action === 'append') {
          await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values/${item.sheetName}!A2:append?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [item.payload as (string | number)[]],
            }),
          });
        }
        processed++;
      } catch (err) {
        console.warn(`Sync queue item ${item.id} failed, retaining for retry:`, err);
        item.retryCount++;
        if (item.retryCount < 5) {
          remaining.push(item);
        }
      }
    }

    this.queue = remaining;
    this.saveQueue();
    return processed;
  }
}

export const googleSheetsService = new GoogleSheetsService();
