import {
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  RecurringExpense,
  Bill,
  PaymentHistory,
  FocusStatsData,
  FinanceSummaryData,
  Task,
  BudgetEnvelope,
  SavingsGoal,
  DurableSyncOperation,
  UserSettings,
} from '../types/index.ts';
import { api } from './api.ts';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

export interface SyncQueueItem {
  id: string;
  sheetName: string;
  action: 'append' | 'update_cell' | 'full_refresh';
  payload: unknown;
  timestamp: string;
  retryCount: number;
  dedupeKey?: string;
  nextRetryAt?: number;
}

// ============================================================================
// 1. THE 23 MASTER WORKSHEETS CATALOG
// ============================================================================
export const WORKSHEET_NAMES = [
  // Executive Dashboards (Flagship First 3 Sheets)
  'Executive_Dashboard',
  'Finance_Dashboard',
  'Productivity_Dashboard',

  // Productivity Division
  'Focus_Sessions',
  'Focus_Daily',
  'Focus_Weekly',
  'Focus_Monthly',
  'Tasks',
  'Task_Analytics',
  'Productivity_Goals',

  // Finance Division
  'Income',
  'Fixed_Expenses',
  'Variable_Expenses',
  'Bills_Payments',
  'Budgets',
  'Savings_Goals',
  'Finance_Daily',
  'Finance_Weekly',
  'Finance_Monthly',

  // System & Governance Division
  'Sync_Control',
  'Sync_Error_Log',
  'Data_Dictionary',
  'Settings',
] as const;

export type WorksheetName = (typeof WORKSHEET_NAMES)[number];

export function getSheetId(name: WorksheetName): number {
  return 100 + WORKSHEET_NAMES.indexOf(name);
}

// ============================================================================
// 2. WORKSHEET HEADERS SPECIFICATION
// ============================================================================
export const WORKSHEET_HEADERS: Record<WorksheetName, string[]> = {
  Executive_Dashboard: [
    'Metric Category',
    'KPI Description',
    'Current Value',
    'Benchmark / Target',
    'Frequency',
    'Operational Notes',
  ],
  Finance_Dashboard: [
    'Financial Metric',
    'Amount (₹) / Rate',
    'Benchmark / Target',
    'Status',
    'Frequency',
    'Operational Notes',
  ],
  Productivity_Dashboard: [
    'Productivity Metric',
    'Quantity / Duration',
    'Target / Velocity',
    'Status',
    'Cadence',
    'Operational Notes',
  ],
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
  Focus_Daily: ['Date', 'Day', 'Focus Minutes', 'Focus Hours', 'Completed Sessions'],
  Focus_Weekly: [
    'Week Range',
    'Productive Hours',
    'Average Daily Focus (Min)',
    'Completed Cycles',
  ],
  Focus_Monthly: ['Month', 'Total Focus Hours', 'Completed Sessions', 'Streak Record (Days)'],
  Tasks: [
    'Task ID',
    'Title',
    'Priority',
    'Status',
    'Estimated Pomodoros',
    'Completed Pomodoros',
    'Due Date',
    'Category',
    'Recurrence',
    'Created At',
  ],
  Task_Analytics: [
    'Analysis Metric',
    'Current Value',
    'Target / Standard',
    'Status',
    'Insights & Recommendations',
  ],
  Productivity_Goals: [
    'Goal Metric',
    'Target Level',
    'Current Achieved',
    'Progress (%)',
    'Cadence',
    'Status',
  ],
  Income: ['Income ID', 'Date', 'Source / Client', 'Category', 'Amount (₹)', 'Notes'],
  Fixed_Expenses: [
    'Plan ID',
    'Plan Name',
    'Category',
    'Monthly Outflow (₹)',
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
  Budgets: [
    'Envelope ID',
    'Category',
    'Allocated Amount (₹)',
    'Spent Amount (₹)',
    'Remaining Balance (₹)',
    'Utilization (%)',
    'Health Status',
  ],
  Savings_Goals: [
    'Goal ID',
    'Goal Name',
    'Target Amount (₹)',
    'Current Saved (₹)',
    'Remaining (₹)',
    'Target Date',
    'Progress (%)',
    'Status',
  ],
  Finance_Daily: ['Date', 'Income (₹)', 'Expenses (₹)', 'Net Cashflow (₹)'],
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
  Sync_Control: [
    'System Component',
    'Status / Metric',
    'Operational Value',
    'Architecture Specification',
  ],
  Sync_Error_Log: [
    'Log ID',
    'Timestamp',
    'Operation Type',
    'Entity Type',
    'Record ID',
    'Retry Count',
    'Error Details',
    'Recovery Status',
  ],
  Data_Dictionary: [
    'Worksheet Name',
    'Field / Column Name',
    'Data Type',
    'Formatting Standard',
    'Validation Rule',
    'Calculation / Derivation',
  ],
  Settings: [
    'Configuration Parameter',
    'Active Value',
    'Default Value',
    'Description & Scope',
  ],
};

// ============================================================================
// 3. COLUMN FORMAT SPECIFICATION
// ============================================================================
export interface SheetFormatSpec {
  currencyCols: number[];
  percentCols: number[];
  integerCols: number[];
  decimalCols: number[];
  centerCols: number[];
  rightCols: number[];
}

export const SHEET_COLUMN_FORMATS: Record<WorksheetName, SheetFormatSpec> = {
  Executive_Dashboard: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [0, 3, 4],
    rightCols: [2],
  },
  Finance_Dashboard: {
    currencyCols: [1],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [3, 4],
    rightCols: [1, 2],
  },
  Productivity_Dashboard: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [3, 4],
    rightCols: [1, 2],
  },
  Focus_Sessions: {
    currencyCols: [],
    percentCols: [],
    integerCols: [3],
    decimalCols: [],
    centerCols: [1, 2, 5],
    rightCols: [3],
  },
  Focus_Daily: {
    currencyCols: [],
    percentCols: [],
    integerCols: [2, 4],
    decimalCols: [3],
    centerCols: [0, 1],
    rightCols: [2, 3, 4],
  },
  Focus_Weekly: {
    currencyCols: [],
    percentCols: [],
    integerCols: [2, 3],
    decimalCols: [1],
    centerCols: [],
    rightCols: [1, 2, 3],
  },
  Focus_Monthly: {
    currencyCols: [],
    percentCols: [],
    integerCols: [2, 3],
    decimalCols: [1],
    centerCols: [],
    rightCols: [1, 2, 3],
  },
  Tasks: {
    currencyCols: [],
    percentCols: [],
    integerCols: [4, 5],
    decimalCols: [],
    centerCols: [2, 3, 6, 8],
    rightCols: [4, 5],
  },
  Task_Analytics: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [2, 3],
    rightCols: [1],
  },
  Productivity_Goals: {
    currencyCols: [],
    percentCols: [3],
    integerCols: [],
    decimalCols: [],
    centerCols: [4, 5],
    rightCols: [1, 2, 3],
  },
  Income: {
    currencyCols: [4],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1],
    rightCols: [4],
  },
  Fixed_Expenses: {
    currencyCols: [3],
    percentCols: [],
    integerCols: [5],
    decimalCols: [],
    centerCols: [4, 6],
    rightCols: [3, 5],
  },
  Variable_Expenses: {
    currencyCols: [4],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1, 5],
    rightCols: [4],
  },
  Bills_Payments: {
    currencyCols: [4],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1, 5, 6, 7],
    rightCols: [4],
  },
  Budgets: {
    currencyCols: [2, 3, 4],
    percentCols: [5],
    integerCols: [],
    decimalCols: [],
    centerCols: [6],
    rightCols: [2, 3, 4, 5],
  },
  Savings_Goals: {
    currencyCols: [2, 3, 4],
    percentCols: [6],
    integerCols: [],
    decimalCols: [],
    centerCols: [5, 7],
    rightCols: [2, 3, 4, 6],
  },
  Finance_Daily: {
    currencyCols: [1, 2, 3],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [0],
    rightCols: [1, 2, 3],
  },
  Finance_Weekly: {
    currencyCols: [1, 2, 3, 4, 5],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [],
    rightCols: [1, 2, 3, 4, 5],
  },
  Finance_Monthly: {
    currencyCols: [1, 2, 3, 4, 5],
    percentCols: [6],
    integerCols: [],
    decimalCols: [],
    centerCols: [],
    rightCols: [1, 2, 3, 4, 5, 6],
  },
  Sync_Control: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1],
    rightCols: [],
  },
  Sync_Error_Log: {
    currencyCols: [],
    percentCols: [],
    integerCols: [5],
    decimalCols: [],
    centerCols: [1, 2, 7],
    rightCols: [5],
  },
  Data_Dictionary: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [2, 3],
    rightCols: [],
  },
  Settings: {
    currencyCols: [],
    percentCols: [],
    integerCols: [],
    decimalCols: [],
    centerCols: [1, 2],
    rightCols: [],
  },
};

export function formatPaymentMethodLabel(method?: string | null, isPaid = false): string {
  if (!isPaid && !method) return '—';
  const normalized = (method || '').trim().toLowerCase();
  if (normalized === 'cash') return 'Cash';
  if (normalized === 'card') return 'Card';
  if (normalized === 'upi_bank' || normalized === 'upi') return 'UPI / Bank';
  if (normalized === 'auto_debit') return 'Auto-Debit';
  if (normalized) return normalized.replace(/_/g, ' ').toUpperCase();
  return isPaid ? 'UPI / Bank' : '—';
}

function computeBestStreakFromSessions(sessions: FocusSession[]): number {
  const dates = Array.from(
    new Set(
      sessions
        .filter((s) => s && s.completed && s.mode === 'work' && typeof s.startedAt === 'string')
        .map((s) => s.startedAt.slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  ).sort();
  if (dates.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T00:00:00.000Z`);
    const next = new Date(`${dates[i]}T00:00:00.000Z`);
    const diff = Math.round((next.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      current++;
      if (current > best) best = current;
    } else if (diff > 1) {
      current = 1;
    }
  }
  return best;
}

// ============================================================================
// 4. WORKBOOK STYLING ENGINE (RUNS AT WORKBOOK CREATION / REPAIR)
// ============================================================================
export function buildCreateStylingRequests(): unknown[] {
  const requests: unknown[] = [];

  WORKSHEET_NAMES.forEach((name) => {
    const sheetId = getSheetId(name);
    const headers = WORKSHEET_HEADERS[name];
    const spec = SHEET_COLUMN_FORMATS[name];
    const isDashboard =
      name === 'Executive_Dashboard' ||
      name === 'Finance_Dashboard' ||
      name === 'Productivity_Dashboard';
    const headerRowIndex = isDashboard ? 2 : 0;
    const dataStartRowIndex = headerRowIndex + 1;
    const dataEndRowIndex = 500;

    // 0. Dashboard Top Banner (Rows 0-2)
    if (isDashboard) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: Math.max(headers.length, 6),
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.059, green: 0.09, blue: 0.165 }, // #0F172A Deep Navy
              verticalAlignment: 'MIDDLE',
              textFormat: {
                foregroundColor: { red: 0.94, green: 0.96, blue: 0.99 },
                fontSize: 11,
                bold: true,
                fontFamily: 'Roboto',
              },
              padding: { top: 6, bottom: 6, left: 12, right: 12 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,verticalAlignment,textFormat,padding)',
        },
      });

      // Subtitle / separation row
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: Math.max(headers.length, 6),
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.118, green: 0.161, blue: 0.235 }, // #1E293B Slate Navy
              verticalAlignment: 'MIDDLE',
              textFormat: {
                foregroundColor: { red: 0.58, green: 0.64, blue: 0.72 },
                fontSize: 9,
                italic: true,
                fontFamily: 'Roboto',
              },
              padding: { top: 3, bottom: 3, left: 12, right: 12 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,verticalAlignment,textFormat,padding)',
        },
      });
    }

    // 1. Column Header Row Styling (#0F172A navy, bold white Roboto, centered, 36px height)
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: headerRowIndex,
          endRowIndex: headerRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: headers.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.078, green: 0.118, blue: 0.22 }, // #141E38
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              fontSize: 10,
              bold: true,
              fontFamily: 'Roboto',
            },
            padding: { top: 6, bottom: 6, left: 10, right: 10 },
          },
        },
        fields:
          'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)',
      },
    });

    // 2. Row Heights (Header: 36px, Data: 26px)
    requests.push(
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: headerRowIndex,
            endIndex: dataStartRowIndex,
          },
          properties: { pixelSize: 36 },
          fields: 'pixelSize',
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: dataStartRowIndex,
            endIndex: dataEndRowIndex,
          },
          properties: { pixelSize: 26 },
          fields: 'pixelSize',
        },
      }
    );

    // 3. Alternating Row Shading (addBanding: White / #F8FAFC)
    requests.push({
      addBanding: {
        bandedRange: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: 0,
            endColumnIndex: headers.length,
          },
          rowProperties: {
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: { red: 0.973, green: 0.98, blue: 0.988 }, // #F8FAFC
          },
        },
      },
    });

    // 4. Subtle Inner & Outer Light Gray Borders (#E2E8F0)
    const lightGrayBorder = {
      style: 'SOLID',
      width: 1,
      color: { red: 0.886, green: 0.91, blue: 0.941 }, // #E2E8F0
    };
    requests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: headerRowIndex,
          endRowIndex: dataEndRowIndex,
          startColumnIndex: 0,
          endColumnIndex: headers.length,
        },
        top: lightGrayBorder,
        bottom: lightGrayBorder,
        left: lightGrayBorder,
        right: lightGrayBorder,
        innerHorizontal: lightGrayBorder,
        innerVertical: lightGrayBorder,
      },
    });

    // 5. Default Data Font Family (Roboto, 9.5pt, vertical middle)
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: dataStartRowIndex,
          endRowIndex: dataEndRowIndex,
          startColumnIndex: 0,
          endColumnIndex: headers.length,
        },
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'MIDDLE',
            textFormat: {
              fontFamily: 'Roboto',
              fontSize: 9,
              foregroundColor: { red: 0.12, green: 0.16, blue: 0.22 }, // #1F2937
            },
            padding: { top: 2, bottom: 2, left: 8, right: 8 },
          },
        },
        fields: 'userEnteredFormat(verticalAlignment,textFormat,padding)',
      },
    });

    // 6. Currency Column Formatting: Indian Rupee (₹#,##0.00)
    spec.currencyCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
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
    });

    // 7. Percentage Formatting: 0.0%
    spec.percentCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'PERCENT',
                pattern: '0.0%',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });
    });

    // 8. Integer Formatting: #,##0
    spec.integerCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'NUMBER',
                pattern: '#,##0',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });
    });

    // 9. Decimal Formatting: #,##0.00
    spec.decimalCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'NUMBER',
                pattern: '#,##0.00',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });
    });

    // 10. Center Alignments
    spec.centerCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
            },
          },
          fields: 'userEnteredFormat.horizontalAlignment',
        },
      });
    });

    // 11. Right Alignments
    spec.rightCols.forEach((colIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: dataStartRowIndex,
            endRowIndex: dataEndRowIndex,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat.horizontalAlignment',
        },
      });
    });

    // 12. Native Basic Filters on Data Sheets
    if (
      name === 'Focus_Sessions' ||
      name === 'Tasks' ||
      name === 'Income' ||
      name === 'Variable_Expenses' ||
      name === 'Fixed_Expenses' ||
      name === 'Bills_Payments' ||
      name === 'Budgets' ||
      name === 'Savings_Goals'
    ) {
      requests.push({
        setBasicFilter: {
          filter: {
            range: {
              sheetId,
              startRowIndex: headerRowIndex,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
          },
        },
      });
    }
  });

  // ==========================================================================
  // DROPDOWN DATA VALIDATIONS (INTERACTIVE EXCELLENCE)
  // ==========================================================================
  const addDropdown = (sheet: WorksheetName, col: number, values: string[]) => {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: getSheetId(sheet),
          startRowIndex: 1,
          endRowIndex: 500,
          startColumnIndex: col,
          endColumnIndex: col + 1,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: values.map((v) => ({ userEnteredValue: v })),
          },
          showCustomUi: true,
          strict: false,
        },
      },
    });
  };

  // Bills_Payments: Status (Col F: 5) & Payment Method (Col H: 7)
  addDropdown('Bills_Payments', 5, ['PAID', 'UNPAID', 'OVERDUE']);
  addDropdown('Bills_Payments', 7, ['UPI / Bank', 'Card', 'Cash', 'Auto-Debit', 'Other']);

  // Tasks: Priority (Col C: 2), Status (Col D: 3), Recurrence (Col I: 8)
  addDropdown('Tasks', 2, ['high', 'medium', 'low']);
  addDropdown('Tasks', 3, ['todo', 'in_progress', 'completed']);
  addDropdown('Tasks', 8, ['none', 'daily', 'weekly', 'monthly']);

  // Fixed_Expenses: Recurrence (Col E: 4), Status (Col G: 6)
  addDropdown('Fixed_Expenses', 4, ['MONTHLY', 'QUARTERLY', 'YEARLY']);
  addDropdown('Fixed_Expenses', 6, ['ACTIVE', 'INACTIVE']);

  // Budgets: Health Status (Col G: 6)
  addDropdown('Budgets', 6, ['ON_TRACK', 'WARNING', 'OVERSPENT']);

  // ==========================================================================
  // CONDITIONAL FORMATTING RULES
  // ==========================================================================
  const billsSheetId = getSheetId('Bills_Payments');
  requests.push(
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'PAID' }] },
            format: {
              backgroundColor: { red: 0.902, green: 0.969, blue: 0.925 }, // #E6F7EC Soft Green
              textFormat: { foregroundColor: { red: 0.02, green: 0.478, blue: 0.239 }, bold: true },
            },
          },
        },
        index: 0,
      },
    },
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'UNPAID' }] },
            format: {
              backgroundColor: { red: 0.996, green: 0.953, blue: 0.78 }, // #FEF3C7 Soft Amber
              textFormat: { foregroundColor: { red: 0.706, green: 0.325, blue: 0.035 }, bold: true },
            },
          },
        },
        index: 1,
      },
    },
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: billsSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }],
          booleanRule: {
            condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'OVERDUE' }] },
            format: {
              backgroundColor: { red: 0.996, green: 0.886, blue: 0.886 }, // #FEE2E2 Soft Red
              textFormat: { foregroundColor: { red: 0.725, green: 0.11, blue: 0.11 }, bold: true },
            },
          },
        },
        index: 2,
      },
    }
  );

  // Cashflow positive/negative highlighting on Finance_Daily (Col D: 3), Finance_Weekly (Col F: 5), Finance_Monthly (Col F: 5)
  const addCashflowHighlighting = (sheetId: number, colIndex: number, startRuleIdx: number) => {
    requests.push(
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 }],
            booleanRule: {
              condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] },
              format: {
                backgroundColor: { red: 0.902, green: 0.969, blue: 0.925 },
                textFormat: { foregroundColor: { red: 0.02, green: 0.478, blue: 0.239 }, bold: true },
              },
            },
          },
          index: startRuleIdx,
        },
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 }],
            booleanRule: {
              condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] },
              format: {
                backgroundColor: { red: 0.988, green: 0.91, blue: 0.91 },
                textFormat: { foregroundColor: { red: 0.784, green: 0.118, blue: 0.169 }, bold: true },
              },
            },
          },
          index: startRuleIdx + 1,
        },
      }
    );
  };

  addCashflowHighlighting(getSheetId('Finance_Daily'), 3, 0);
  addCashflowHighlighting(getSheetId('Finance_Weekly'), 5, 0);
  addCashflowHighlighting(getSheetId('Finance_Monthly'), 5, 0);

  // ==========================================================================
  // EMBEDDED NATIVE CHARTS
  // ==========================================================================
  const execSheetId = getSheetId('Executive_Dashboard');
  const finDashId = getSheetId('Finance_Dashboard');
  const prodDashId = getSheetId('Productivity_Dashboard');
  const finMonthlyId = getSheetId('Finance_Monthly');
  const focusDailyId = getSheetId('Focus_Daily');

  requests.push(
    // Chart 1: Monthly Income vs Expenses (Executive Dashboard H4:M18)
    {
      addChart: {
        chart: {
          spec: {
            title: 'Monthly Inflows vs. Operating Expenses (₹)',
            basicChart: {
              chartType: 'COLUMN',
              legendPosition: 'BOTTOM_LEGEND',
              headerCount: 1,
              axis: [
                { position: 'BOTTOM_AXIS', title: 'Month' },
                { position: 'LEFT_AXIS', title: 'INR (₹)' },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 1 },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 1, endColumnIndex: 2 },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                },
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 4, endColumnIndex: 5 },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                },
              ],
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: execSheetId, rowIndex: 3, columnIndex: 7 }, // H4
              widthPixels: 520,
              heightPixels: 310,
            },
          },
        },
      },
    },

    // Chart 2: Daily Focus Hours Trend Line (Executive Dashboard H20:M33)
    {
      addChart: {
        chart: {
          spec: {
            title: 'Daily Deep Work Focus Trend (Hours)',
            basicChart: {
              chartType: 'LINE',
              legendPosition: 'BOTTOM_LEGEND',
              headerCount: 1,
              axis: [
                { position: 'BOTTOM_AXIS', title: 'Date' },
                { position: 'LEFT_AXIS', title: 'Hours' },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 1 },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 3, endColumnIndex: 4 },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                },
              ],
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: execSheetId, rowIndex: 19, columnIndex: 7 }, // H20
              widthPixels: 520,
              heightPixels: 290,
            },
          },
        },
      },
    },

    // Chart 3: Fixed vs Variable Spend Ratio Donut Chart (Executive Dashboard N4:S18)
    {
      addChart: {
        chart: {
          spec: {
            title: 'Fixed vs. Variable Outflow Mix (₹)',
            pieChart: {
              legendPosition: 'RIGHT_LEGEND',
              pieHole: 0.55,
              domain: {
                sourceRange: {
                  sources: [
                    { sheetId: execSheetId, startRowIndex: 21, endRowIndex: 23, startColumnIndex: 0, endColumnIndex: 1 },
                  ],
                },
              },
              series: {
                sourceRange: {
                  sources: [
                    { sheetId: execSheetId, startRowIndex: 21, endRowIndex: 23, startColumnIndex: 1, endColumnIndex: 2 },
                  ],
                },
              },
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: execSheetId, rowIndex: 3, columnIndex: 13 }, // N4
              widthPixels: 430,
              heightPixels: 310,
            },
          },
        },
      },
    },

    // Chart 4: Monthly Net Cashflow Trajectory (Finance Dashboard H4:N18)
    {
      addChart: {
        chart: {
          spec: {
            title: 'Net Monthly Savings & Treasury Accumulation (₹)',
            basicChart: {
              chartType: 'COLUMN',
              legendPosition: 'NONE',
              headerCount: 1,
              axis: [
                { position: 'BOTTOM_AXIS', title: 'Month' },
                { position: 'LEFT_AXIS', title: 'Net Savings (₹)' },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 1 },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: finMonthlyId, startRowIndex: 0, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 6 },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                },
              ],
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: finDashId, rowIndex: 3, columnIndex: 7 }, // H4
              widthPixels: 520,
              heightPixels: 310,
            },
          },
        },
      },
    },

    // Chart 5: Daily Completed Sessions (Productivity Dashboard H4:N18)
    {
      addChart: {
        chart: {
          spec: {
            title: 'Daily Completed Pomodoro Cycles',
            basicChart: {
              chartType: 'COLUMN',
              legendPosition: 'NONE',
              headerCount: 1,
              axis: [
                { position: 'BOTTOM_AXIS', title: 'Date' },
                { position: 'LEFT_AXIS', title: 'Completed Sessions' },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 1 },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        { sheetId: focusDailyId, startRowIndex: 0, endRowIndex: 32, startColumnIndex: 4, endColumnIndex: 5 },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                },
              ],
            },
          },
          position: {
            overlayPosition: {
              anchorCell: { sheetId: prodDashId, rowIndex: 3, columnIndex: 7 }, // H4
              widthPixels: 520,
              heightPixels: 310,
            },
          },
        },
      },
    }
  );

  return requests;
}

// ============================================================================
// 5. AUTO-RESIZE COLUMNS ENGINE
// ============================================================================
export function buildSyncResizeRequests(): unknown[] {
  return WORKSHEET_NAMES.map((name) => ({
    autoResizeDimensions: {
      dimensions: {
        sheetId: getSheetId(name),
        dimension: 'COLUMNS',
        startIndex: 0,
        endIndex: WORKSHEET_HEADERS[name].length,
      },
    },
  }));
}

// ============================================================================
// 6. VALUE UPDATES BUILDER (ALL 23 WORKSHEETS)
// ============================================================================
export function buildSyncValueUpdates(data: {
  sessions: FocusSession[];
  focusStats?: FocusStatsData | null;
  incomes: IncomeTransaction[];
  recurring: RecurringExpense[];
  expenses: ExpenseTransaction[];
  bills: Bill[];
  paymentHistory?: PaymentHistory[];
  financeSummary?: FinanceSummaryData | null;
  tasks?: Task[];
  envelopes?: BudgetEnvelope[];
  savingsGoals?: SavingsGoal[];
  syncQueue?: DurableSyncOperation[];
  userSettings?: UserSettings | null;
}): Array<{ range: string; values: (string | number)[][] }> {
  const valueUpdates: Array<{ range: string; values: (string | number)[][] }> = [];
  const syncTimestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  const activeIncomes = data.incomes.filter((i) => !i.deletedAt);
  const activeExpenses = data.expenses.filter((e) => !e.deletedAt);
  const activeBills = data.bills.filter((b) => !b.deletedAt);
  const activeTasks = (data.tasks || []).filter((t) => !t.deletedAt);
  const activeEnvelopes = (data.envelopes || []).filter((env) => !env.deletedAt);
  const activeGoals = (data.savingsGoals || []).filter(
    (g) => !('deletedAt' in g && Boolean((g as unknown as { deletedAt?: string }).deletedAt))
  );

  // Payment method map
  const billPaymentMethodMap = new Map<string, string>();
  for (const p of data.paymentHistory || []) {
    if (p.billId && p.paymentMethod) {
      billPaymentMethodMap.set(p.billId, p.paymentMethod);
    }
  }
  for (const exp of activeExpenses) {
    if (exp.billId && exp.paymentMethod && !billPaymentMethodMap.has(exp.billId)) {
      billPaymentMethodMap.set(exp.billId, exp.paymentMethod);
    }
  }

  // --------------------------------------------------------------------------
  // SHEET 1: Executive_Dashboard (Flagship First Sheet)
  // --------------------------------------------------------------------------
  const execRows: (string | number)[][] = [
    [
      'FOCUSFLOW & FINANCE — EXECUTIVE INTELLIGENCE DASHBOARD',
      'Workbook Status:',
      'ACTIVE & SYNCHRONIZED',
      'Last Refreshed:',
      syncTimestamp,
      'Base Currency: INR (₹)',
    ],
    [
      'Unified executive intelligence across productivity velocity and financial treasury reserves.',
      '',
      '',
      '',
      '',
      '',
    ],
    WORKSHEET_HEADERS.Executive_Dashboard,
    ['Productivity', "Today's Deep Work Focus", '=IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:C, 3, FALSE), 0) & " min"', '>= 120 min', 'Daily', 'Today logged focus duration'],
    ['Productivity', 'Weekly Focus Volume', '=Focus_Weekly!B2 & " hrs"', '>= 15 hrs', 'Weekly', 'Rolling 7-day deep work hours'],
    ['Productivity', 'Monthly Focus Volume', '=Focus_Monthly!B2 & " hrs"', '>= 60 hrs', 'Monthly', 'Total month deep focus volume'],
    ['Productivity', 'Completed Focus Cycles', '=COUNTIF(Focus_Sessions!F:F, "YES")', 'All-Time', 'Cumulative', 'Verified completed Pomodoro sessions'],
    ['Productivity', 'Average Session Duration', '=IFERROR(ROUND(AVERAGE(Focus_Sessions!D:D), 1), 0) & " min"', '25-50 min', 'Per Session', 'Average continuous focus span'],
    ['Productivity', 'Current Productivity Streak', '=Focus_Monthly!D2 & " days"', 'Continuous', 'Daily', 'Consecutive days with focus sessions'],
    ['Productivity', 'Task Completion Velocity', '=Task_Analytics!B5', '>= 75.0%', 'Cumulative', 'Completed vs total registered tasks'],
    ['Finance', 'Total Cumulative Inflow', '=SUM(Income!E2:E)', 'Gross Earnings', 'All-Time', 'Verified revenue and income receipts'],
    ['Finance', 'Total Operating Outflows', '=SUM(Variable_Expenses!E2:E) + SUM(Fixed_Expenses!D2:D)', 'Total Spend', 'All-Time', 'Variable spend plus fixed commitments'],
    ['Finance', 'Net Treasury Balance', '=C11-C12', 'Positive Cash', 'Current', 'Liquid reserves net position after outflows'],
    ['Finance', 'Monthly Fixed Commitments', '=SUM(Fixed_Expenses!D2:D)', 'Contractual', 'Monthly', 'Rent, utilities, subscriptions & insurance'],
    ['Finance', 'Variable Spending Volume', '=SUM(Variable_Expenses!E2:E)', 'Discretionary', 'Current', 'Groceries, transit, dining & shopping'],
    ['Finance', 'Settled Bill Disbursements', '=SUMIF(Bills_Payments!F:F, "PAID", Bills_Payments!E:E)', 'Disbursed', 'Monthly', 'Settled commitments with payment proof'],
    ['Finance', 'Pending Scheduled Bills', '=SUMIF(Bills_Payments!F:F, "UNPAID", Bills_Payments!E:E)', 'Upcoming', 'Monthly', 'Scheduled bills awaiting due date settlement'],
    ['Finance', 'Overdue Debt Warning', '=SUMIF(Bills_Payments!F:F, "OVERDUE", Bills_Payments!E:E)', '₹0.00 (Zero)', 'Immediate', 'Unsettled bills past due date'],
    ['Finance', 'Monthly Savings Rate', '=IF(C11>0, (C11-C12)/C11, 0)', '>= 20.0%', 'Monthly', 'Net savings as percentage of gross income'],
    ['Finance', 'Envelope Budget Utilization', '=IF(SUM(Budgets!C2:C)>0, SUM(Budgets!D2:D)/SUM(Budgets!C2:C), 0)', '<= 100.0%', 'Monthly', 'Overall envelope budget absorption'],
    ['', '', '', '', '', ''],
    ['Fixed Commitments', '=SUM(Fixed_Expenses!D2:D)', '', '', '', ''],
    ['Variable Outflows', '=SUM(Variable_Expenses!E2:E)', '', '', '', ''],
  ];

  valueUpdates.push({
    range: 'Executive_Dashboard!A1:F23',
    values: execRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 2: Finance_Dashboard
  // --------------------------------------------------------------------------
  const finDashRows: (string | number)[][] = [
    [
      'FINANCE EXECUTIVE DASHBOARD — CASHFLOW & TREASURY INTELLIGENCE',
      'Status:',
      'ACTIVE',
      'Currency:',
      'INR (₹)',
      syncTimestamp,
    ],
    [
      'Comprehensive financial analytics, expense classification, bill settlement and budget health.',
      '',
      '',
      '',
      '',
      '',
    ],
    WORKSHEET_HEADERS.Finance_Dashboard,
    ['Gross Monthly Inflow', '=Finance_Monthly!B2', 'Target Inflow', 'HEALTHY', 'Monthly', 'Current month recognized income'],
    ['Fixed Monthly Outflow', '=Finance_Monthly!C2', 'Contractual Cap', 'COMMITTED', 'Monthly', 'Rent, utilities, SaaS & insurance'],
    ['Variable Monthly Outflow', '=Finance_Monthly!D2', 'Budget Cap', 'ON_TRACK', 'Monthly', 'Day-to-day operational spend'],
    ['Total Monthly Disbursements', '=Finance_Monthly!E2', 'Outflow Ceiling', 'TRACKED', 'Monthly', 'Combined monthly outflow'],
    ['Net Monthly Treasury Accumulation', '=Finance_Monthly!F2', 'Positive Cash', 'SAVINGS', 'Monthly', 'Net cash surplus retained'],
    ['Net Savings Rate', '=Finance_Monthly!G2', '>= 20.0%', 'BENCHMARK', 'Monthly', 'Savings percentage of gross inflow'],
    ['Total Settled Bills', '=SUMIF(Bills_Payments!F:F, "PAID", Bills_Payments!E:E)', 'Disbursed', 'PAID', 'Monthly', 'Settled bills in current schedule'],
    ['Pending Scheduled Bills', '=SUMIF(Bills_Payments!F:F, "UNPAID", Bills_Payments!E:E)', 'Due Soon', 'PENDING', 'Monthly', 'Upcoming bills within grace period'],
    ['Overdue Payment Alert', '=SUMIF(Bills_Payments!F:F, "OVERDUE", Bills_Payments!E:E)', '₹0.00', 'CRITICAL', 'Urgent', 'Overdue obligations requiring payment'],
    ['Total Allocated Budget Envelopes', '=SUM(Budgets!C2:C)', 'Envelope Ceiling', 'PLANNED', 'Monthly', 'Sum of all category budget allocations'],
    ['Total Envelope Spend Recorded', '=SUM(Budgets!D2:D)', '<= Allocated', 'SPENT', 'Monthly', 'Total spend categorized under envelopes'],
    ['Remaining Budget Surplus', '=SUM(Budgets!E2:E)', 'Positive Balance', 'AVAILABLE', 'Monthly', 'Remaining available envelope balance'],
  ];

  valueUpdates.push({
    range: 'Finance_Dashboard!A1:F15',
    values: finDashRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 3: Productivity_Dashboard
  // --------------------------------------------------------------------------
  const prodDashRows: (string | number)[][] = [
    [
      'PRODUCTIVITY EXECUTIVE DASHBOARD — DEEP WORK & TASK VELOCITY',
      'Status:',
      'ACTIVE',
      'Interval:',
      '25m Pomodoro',
      syncTimestamp,
    ],
    [
      'Granular performance tracking, Pomodoro stamina, task completion velocity and daily streak logs.',
      '',
      '',
      '',
      '',
      '',
    ],
    WORKSHEET_HEADERS.Productivity_Dashboard,
    ['Total Focus Hours Logged', '=SUM(Focus_Daily!D2:D)', '>= 100 hrs', 'ON_TRACK', 'All-Time', 'Total verified deep work hours'],
    ['Total Completed Pomodoro Cycles', '=SUM(Focus_Daily!E2:E)', 'Target: 250+', 'RECORDED', 'All-Time', 'Completed full focus sessions'],
    ['Current Active Focus Streak', '=Focus_Monthly!D2 & " days"', 'Target: 30 days', 'ACTIVE', 'Daily', 'Unbroken daily focus habit streak'],
    ['Total Registered Tasks Inventory', '=COUNTA(Tasks!A2:A)', 'Active Backlog', 'MANAGEABLE', 'Current', 'Total tasks in project pipeline'],
    ['Finished & Verified Tasks', '=COUNTIF(Tasks!D2:D, "completed")', 'Max throughput', 'COMPLETED', 'Current', 'Successfully delivered tasks'],
    ['Tasks Currently In Progress', '=COUNTIF(Tasks!D2:D, "in_progress")', '<= 3 concurrent', 'WIP_LIMIT', 'Current', 'Active focus tasks without switching'],
    ['Backlog Pending Tasks', '=COUNTIF(Tasks!D2:D, "todo")', 'Prioritized queue', 'QUEUED', 'Current', 'Awaiting execution'],
    ['High-Priority Critical Tasks', '=COUNTIF(Tasks!C2:C, "high")', 'Minimize bottlenecks', 'HIGH_PRIORITY', 'Current', 'Urgent tasks requiring prompt delivery'],
    ['Estimated Total Pomodoros', '=SUM(Tasks!E2:E)', 'Resource plan', 'PLANNED', 'All-Time', 'Estimated workload demand'],
    ['Completed Pomodoro Cycles', '=SUM(Tasks!F2:F)', 'Actual effort', 'DELIVERED', 'All-Time', 'Actual Pomodoros logged to tasks'],
  ];

  valueUpdates.push({
    range: 'Productivity_Dashboard!A1:F13',
    values: prodDashRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 4: Focus_Sessions
  // --------------------------------------------------------------------------
  const sessionRows = data.sessions.map((s) => [
    s.id,
    s.startedAt.split('T')[0],
    s.mode.toUpperCase(),
    s.durationMinutes,
    s.taskTitle || 'Independent Deep Work Focus',
    s.completed ? 'YES' : 'NO',
    s.startedAt,
    s.endedAt,
  ]);
  valueUpdates.push({
    range: `Focus_Sessions!A2:H${Math.max(2, sessionRows.length + 1)}`,
    values: sessionRows.length > 0 ? sessionRows : [['', '', '', '', '', '', '', '']],
  });

  // --------------------------------------------------------------------------
  // SHEET 5: Focus_Daily
  // --------------------------------------------------------------------------
  const dailyRows = (data.focusStats?.last7Days || []).map((d) => [
    d.date,
    d.dayName,
    d.minutes,
    parseFloat((d.minutes / 60).toFixed(2)),
    d.sessionsCount,
  ]);
  valueUpdates.push({
    range: `Focus_Daily!A2:E${Math.max(2, dailyRows.length + 1)}`,
    values: dailyRows.length > 0 ? dailyRows : [['', '', 0, 0, 0]],
  });

  // --------------------------------------------------------------------------
  // SHEET 6: Focus_Weekly
  // --------------------------------------------------------------------------
  const weeklyRows = [
    [
      'Current Week Active',
      parseFloat(((data.focusStats?.weeklyMinutes ?? data.focusStats?.totalMinutes ?? 0) / 60).toFixed(1)),
      data.focusStats?.last7Days?.length
        ? Math.round((data.focusStats.weeklyMinutes ?? data.focusStats.totalMinutes ?? 0) / 7)
        : 0,
      data.focusStats?.totalCompletedSessions || 0,
    ],
  ];
  valueUpdates.push({
    range: 'Focus_Weekly!A2:D2',
    values: weeklyRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 7: Focus_Monthly
  // --------------------------------------------------------------------------
  const bestStreak = computeBestStreakFromSessions(data.sessions);
  const monthlyFocusRows = [
    [
      new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      parseFloat(((data.focusStats?.monthMinutes || 0) / 60).toFixed(1)),
      data.focusStats?.monthSessionsCount || 0,
      bestStreak,
    ],
  ];
  valueUpdates.push({
    range: 'Focus_Monthly!A2:D2',
    values: monthlyFocusRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 8: Tasks
  // --------------------------------------------------------------------------
  const taskRows = activeTasks.map((t) => [
    t.id,
    t.title,
    t.priority,
    t.status,
    t.estimatedPomodoros,
    t.completedPomodoros,
    t.dueDate || '',
    t.category || 'General',
    t.recurrence || 'none',
    t.createdAt,
  ]);
  valueUpdates.push({
    range: `Tasks!A2:J${Math.max(2, taskRows.length + 1)}`,
    values: taskRows.length > 0 ? taskRows : [['', '', '', '', '', '', '', '', '', '']],
  });

  // --------------------------------------------------------------------------
  // SHEET 9: Task_Analytics
  // --------------------------------------------------------------------------
  const taskAnalyticsRows: (string | number)[][] = [
    ['Total Registered Tasks', '=COUNTA(Tasks!A2:A)', 'Backlog standard', 'NORMAL', 'Total tasks in project pipeline'],
    ['Completed & Verified Tasks', '=COUNTIF(Tasks!D2:D, "completed")', 'High throughput', 'ON_TRACK', 'Delivered tasks'],
    ['Active In-Progress Tasks', '=COUNTIF(Tasks!D2:D, "in_progress")', '<= 3 concurrent', 'WIP_LIMIT', 'Active focus tasks'],
    ['Pending Backlog Tasks', '=COUNTIF(Tasks!D2:D, "todo")', 'Prioritized queue', 'QUEUED', 'Upcoming tasks'],
    ['Overall Completion Ratio', '=IF(B1>0, B2/B1, 0)', '>= 75.0%', 'BENCHMARK', 'Percentage of completed backlog'],
    ['High Priority Tasks Total', '=COUNTIF(Tasks!C2:C, "high")', 'Minimize count', 'ALERT', 'Critical requirements'],
    ['High Priority Completed', '=COUNTIFS(Tasks!C2:C, "high", Tasks!D2:D, "completed")', '100% target', 'DELIVERED', 'Resolved critical tasks'],
    ['High Priority Pending', '=COUNTIFS(Tasks!C2:C, "high", Tasks!D2:D, "<>completed")', '0 target', 'ATTENTION', 'Urgent unfinished tasks'],
    ['Total Estimated Pomodoros', '=SUM(Tasks!E2:E)', 'Planned effort', 'ESTIMATED', 'Total workload estimate'],
    ['Total Delivered Pomodoros', '=SUM(Tasks!F2:F)', 'Actual effort', 'DELIVERED', 'Actual effort executed'],
  ];
  valueUpdates.push({
    range: 'Task_Analytics!A2:E11',
    values: taskAnalyticsRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 10: Productivity_Goals
  // --------------------------------------------------------------------------
  const goalRows: (string | number)[][] = [
    ['Daily Deep Work Hours', '120 min', '=IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:C, 3, FALSE), 0) & " min"', '=IF(120>0, IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:C, 3, FALSE), 0)/120, 0)', 'Daily', 'Goal: 2 hours deep focus'],
    ['Weekly Deep Work Volume', '15.0 hrs', '=Focus_Weekly!B2 & " hrs"', '=IF(15>0, Focus_Weekly!B2/15, 0)', 'Weekly', 'Goal: 15 productive focus hours'],
    ['Daily Completed Pomodoros', '4 sessions', '=IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:E, 5, FALSE), 0)', '=IF(4>0, IFERROR(VLOOKUP(TODAY(), Focus_Daily!A:E, 5, FALSE), 0)/4, 0)', 'Daily', 'Goal: 4 completed sessions'],
    ['Task Delivery Velocity', '5 tasks', '=COUNTIF(Tasks!D2:D, "completed")', '=IF(5>0, COUNTIF(Tasks!D2:D, "completed")/5, 0)', 'Weekly', 'Goal: 5 completed tasks per sprint'],
  ];
  valueUpdates.push({
    range: 'Productivity_Goals!A2:F5',
    values: goalRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 11: Income
  // --------------------------------------------------------------------------
  const incomeRows = activeIncomes.map((inc) => [
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

  // --------------------------------------------------------------------------
  // SHEET 12: Fixed_Expenses
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // SHEET 13: Variable_Expenses
  // --------------------------------------------------------------------------
  const varExpenses = activeExpenses.filter((e) => e.type === 'variable');
  const varRows = varExpenses.map((exp) => [
    exp.id,
    exp.date,
    exp.description,
    exp.categoryName || 'General',
    exp.amountPaise / 100,
    formatPaymentMethodLabel(exp.paymentMethod, true),
    exp.notes || '',
  ]);
  valueUpdates.push({
    range: `Variable_Expenses!A2:G${Math.max(2, varRows.length + 1)}`,
    values: varRows.length > 0 ? varRows : [['', '', '', '', '', '', '']],
  });

  // --------------------------------------------------------------------------
  // SHEET 14: Bills_Payments
  // --------------------------------------------------------------------------
  const billRows = activeBills.map((b) => {
    const resolvedMethod = billPaymentMethodMap.get(b.id);
    return [
      b.id,
      b.dueDate,
      b.name,
      b.categoryName || 'General Bill',
      b.amountPaise / 100,
      b.status,
      b.paymentDate || '',
      formatPaymentMethodLabel(resolvedMethod, b.status === 'PAID'),
      b.notes || '',
    ];
  });
  valueUpdates.push({
    range: `Bills_Payments!A2:I${Math.max(2, billRows.length + 1)}`,
    values: billRows.length > 0 ? billRows : [['', '', '', '', '', '', '', '', '']],
  });

  // --------------------------------------------------------------------------
  // SHEET 15: Budgets (Envelope Budgeting)
  // --------------------------------------------------------------------------
  const budgetRows = activeEnvelopes.map((env) => {
    const allocated = env.allocatedPaise / 100;
    const spent = (env.spentPaise || 0) / 100;
    const remaining = allocated - spent;
    const ratio = allocated > 0 ? parseFloat((spent / allocated).toFixed(4)) : 0;
    const health = spent > allocated ? 'OVERSPENT' : spent >= allocated * 0.85 ? 'WARNING' : 'ON_TRACK';
    return [env.id, env.name, allocated, spent, remaining, ratio, health];
  });
  valueUpdates.push({
    range: `Budgets!A2:G${Math.max(2, budgetRows.length + 1)}`,
    values: budgetRows.length > 0 ? budgetRows : [['', '', 0, 0, 0, 0, 'ON_TRACK']],
  });

  // --------------------------------------------------------------------------
  // SHEET 16: Savings_Goals
  // --------------------------------------------------------------------------
  const goalRowsFinance = activeGoals.map((g) => {
    const target = g.targetPaise / 100;
    const current = g.savedPaise / 100;
    const remaining = Math.max(0, target - current);
    const progress = target > 0 ? parseFloat((current / target).toFixed(4)) : 0;
    const status = current >= target ? 'ACHIEVED' : 'IN_PROGRESS';
    return [g.id, g.title, target, current, remaining, g.targetDate || '', progress, status];
  });
  valueUpdates.push({
    range: `Savings_Goals!A2:H${Math.max(2, goalRowsFinance.length + 1)}`,
    values: goalRowsFinance.length > 0 ? goalRowsFinance : [['', '', 0, 0, 0, '', 0, 'IN_PROGRESS']],
  });

  // --------------------------------------------------------------------------
  // SHEET 17: Finance_Daily
  // --------------------------------------------------------------------------
  const todayStr = new Date().toISOString().split('T')[0];
  const todayIncome =
    activeIncomes.filter((i) => i.date === todayStr).reduce((sum, i) => sum + i.amountPaise, 0) / 100;
  const todayExpense =
    activeExpenses.filter((e) => e.date === todayStr).reduce((sum, e) => sum + e.amountPaise, 0) / 100;

  valueUpdates.push({
    range: 'Finance_Daily!A2:D2',
    values: [[todayStr, todayIncome, todayExpense, todayIncome - todayExpense]],
  });

  // --------------------------------------------------------------------------
  // SHEET 18: Finance_Weekly
  // --------------------------------------------------------------------------
  const totalWeeklyIncome = (data.financeSummary?.totalIncomePaise || 0) / 100;
  const totalWeeklyFixed = (data.financeSummary?.fixedExpensesPaise || 0) / 100;
  const totalWeeklyVar = (data.financeSummary?.variableExpensesPaise || 0) / 100;
  const totalWeeklyExp = (data.financeSummary?.totalExpensePaise || 0) / 100;

  valueUpdates.push({
    range: 'Finance_Weekly!A2:F2',
    values: [
      [
        'Current Active Period',
        totalWeeklyIncome,
        totalWeeklyFixed,
        totalWeeklyVar,
        totalWeeklyExp,
        totalWeeklyIncome - totalWeeklyExp,
      ],
    ],
  });

  // --------------------------------------------------------------------------
  // SHEET 19: Finance_Monthly
  // --------------------------------------------------------------------------
  const monthlyIncome = (data.financeSummary?.totalIncomePaise || 0) / 100;
  const monthlyFixed = (data.financeSummary?.fixedExpensesPaise || 0) / 100;
  const monthlyVar = (data.financeSummary?.variableExpensesPaise || 0) / 100;
  const monthlyTotalExp = (data.financeSummary?.totalExpensePaise || 0) / 100;
  const savings = monthlyIncome - monthlyTotalExp;
  const savingsRatio = monthlyIncome > 0 ? parseFloat((savings / monthlyIncome).toFixed(4)) : 0;

  const trend = data.financeSummary?.monthlyTrend || [];
  const monthlyRows: (string | number)[][] =
    trend.length > 0
      ? trend.map((pt, idx) => {
          const isLatest = idx === trend.length - 1;
          const inc = isLatest ? monthlyIncome : pt.incomePaise / 100;
          const exp = isLatest ? monthlyTotalExp : pt.expensePaise / 100;
          const net = inc - exp;
          const ratio = inc > 0 ? parseFloat((net / inc).toFixed(4)) : 0;
          return [
            pt.month,
            inc,
            isLatest ? monthlyFixed : 0,
            isLatest ? monthlyVar : exp,
            exp,
            net,
            ratio,
          ];
        })
      : [
          [
            new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
            monthlyIncome,
            monthlyFixed,
            monthlyVar,
            monthlyTotalExp,
            savings,
            savingsRatio,
          ],
        ];

  valueUpdates.push({
    range: `Finance_Monthly!A2:G${Math.max(2, monthlyRows.length + 1)}`,
    values: monthlyRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 20: Sync_Control
  // --------------------------------------------------------------------------
  const syncControlRows: (string | number)[][] = [
    ['Primary Database Store', 'Cloud Firestore', 'Single Source of Truth', 'Isolated tenant subcollection tree'],
    ['Secondary Analytical Ledger', 'Google Sheets API v4', 'Executive Reporting', '23 styled worksheets with dynamic formulas'],
    ['Synchronization Protocol', 'Durable Server Queue', 'ACTIVE & SYNCHRONIZED', 'Exponential backoff & retry mechanism'],
    ['Last Verified Synchronization', syncTimestamp, 'Status: SUCCESS', 'Synchronized via values:batchUpdate without reformatting'],
    ['Total Registered Tasks Count', activeTasks.length, 'Records Verified', 'Tasks collection in Firestore'],
    ['Total Verified Incomes Count', activeIncomes.length, 'Records Verified', 'Income subcollection in Firestore'],
    ['Total Verified Expenses Count', activeExpenses.length, 'Records Verified', 'Expenses subcollection in Firestore'],
    ['Total Verified Bills Count', activeBills.length, 'Records Verified', 'Bills subcollection in Firestore'],
    ['Total Focus Sessions Count', data.sessions.length, 'Records Verified', 'Focus sessions subcollection in Firestore'],
    ['Data Format Preservation', 'ACTIVE', 'Decoupled Value Updates', 'Formatting, formulas & charts remain completely intact'],
  ];
  valueUpdates.push({
    range: 'Sync_Control!A2:D11',
    values: syncControlRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 21: Sync_Error_Log
  // --------------------------------------------------------------------------
  const queueErrors = (data.syncQueue || []).filter((op) => op.status === 'failed' || op.attempts > 0);
  const errorRows: (string | number)[][] =
    queueErrors.length > 0
      ? queueErrors.map((op) => [
          op.id,
          op.lastAttemptAt || op.createdAt,
          op.action.toUpperCase(),
          op.entityType,
          op.sheetName,
          op.attempts,
          op.errorMessage || 'Unknown synchronization error',
          op.status.toUpperCase(),
        ])
      : [
          [
            'LOG_INIT',
            syncTimestamp,
            'HEALTH_CHECK',
            'SYSTEM',
            'WORKBOOK_INIT',
            0,
            'All synchronization pipelines healthy; zero transmission failures recorded.',
            'RESOLVED',
          ],
        ];
  valueUpdates.push({
    range: `Sync_Error_Log!A2:H${Math.max(2, errorRows.length + 1)}`,
    values: errorRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 22: Data_Dictionary
  // --------------------------------------------------------------------------
  const dictionaryRows: (string | number)[][] = [
    ['Executive_Dashboard', 'All Cells', 'Formula / Card', 'Formatted Text & Tiles', 'None', 'Aggregates from raw sheets without destroying formats'],
    ['Finance_Dashboard', 'All Cells', 'Formula / Card', 'INR Currency (₹)', 'None', 'Cashflow and treasury health summary'],
    ['Productivity_Dashboard', 'All Cells', 'Formula / Card', 'Hours & Integers', 'None', 'Deep work velocity and task completion metrics'],
    ['Focus_Sessions', 'Duration (Min)', 'Integer', '#,##0', '>= 1', 'Focus session duration in minutes'],
    ['Tasks', 'Priority', 'Enum String', 'Dropdown Text', 'high, medium, low', 'Task importance level'],
    ['Tasks', 'Status', 'Enum String', 'Dropdown Text', 'todo, in_progress, completed', 'Execution state of task'],
    ['Income', 'Amount (₹)', 'Decimal', '"₹"#,##0.00', '> 0', 'Monetary earnings received'],
    ['Fixed_Expenses', 'Monthly Outflow (₹)', 'Decimal', '"₹"#,##0.00', '> 0', 'Recurring fixed financial commitment'],
    ['Variable_Expenses', 'Amount (₹)', 'Decimal', '"₹"#,##0.00', '> 0', 'Day-to-day transaction amount'],
    ['Bills_Payments', 'Payment Status', 'Enum String', 'Dropdown Text', 'PAID, UNPAID, OVERDUE', 'Bill fulfillment state'],
    ['Budgets', 'Allocated Amount (₹)', 'Decimal', '"₹"#,##0.00', '>= 0', 'Monthly envelope budget limit'],
    ['Budgets', 'Utilization (%)', 'Percentage', '0.0%', '>= 0%', 'Spent Amount / Allocated Amount'],
    ['Savings_Goals', 'Progress (%)', 'Percentage', '0.0%', '0.0% - 100.0%', 'Current Saved / Target Amount'],
    ['Finance_Monthly', 'Savings Rate (%)', 'Percentage', '0.0%', 'Any Ratio', '(Total Income - Total Expenses) / Total Income'],
  ];
  valueUpdates.push({
    range: 'Data_Dictionary!A2:F15',
    values: dictionaryRows,
  });

  // --------------------------------------------------------------------------
  // SHEET 23: Settings
  // --------------------------------------------------------------------------
  const settingsRows: (string | number)[][] = [
    ['Base Reporting Currency', data.userSettings?.currency || 'INR', 'INR', 'Base currency symbol and Indian numbering formatting'],
    ['Primary System Timezone', data.userSettings?.timezone || 'Asia/Kolkata', 'Asia/Kolkata', 'Timezone for date boundaries and streak tracking'],
    ['Number Format Pattern', 'Indian Rupee ("₹"#,##0.00)', '"₹"#,##0.00', 'Standard currency display format'],
    ['Date Representation', 'ISO 8601 (YYYY-MM-DD)', 'YYYY-MM-DD', 'Consistent cross-platform date standard'],
    ['Week Start Day', 'Monday', 'Monday', 'Starting day for weekly productivity and cashflow rollups'],
    ['Pomodoro Work Interval', `${data.userSettings?.pomodoroWorkDuration || 25} minutes`, '25 minutes', 'Standard focus work duration'],
    ['Short Break Duration', `${data.userSettings?.shortBreakDuration || 5} minutes`, '5 minutes', 'Rest duration after single focus session'],
    ['Long Break Duration', `${data.userSettings?.longBreakDuration || 15} minutes`, '15 minutes', 'Rest duration after 4 completed Pomodoros'],
  ];
  valueUpdates.push({
    range: 'Settings!A2:D9',
    values: settingsRows,
  });

  return valueUpdates;
}

// ============================================================================
// 7. GOOGLE SHEETS MASTER CONTROLLER SERVICE
// ============================================================================
class GoogleSheetsService {
  private lastError: string | null = null;

  public getLastError(): string | null {
    return this.lastError;
  }

  public clearLastError(): void {
    this.lastError = null;
  }

  /**
   * Creates a master workbook with all 23 styled worksheets, charts, banding,
   * conditional formatting, data validations, and formulas in the user's Google Drive.
   */
  public async createMasterWorkbook(accessToken: string): Promise<string> {
    const title = 'FocusFlow & Finance — Master Management Ledger';

    const sheetObjects = WORKSHEET_NAMES.map((name) => {
      const isDashboard =
        name === 'Executive_Dashboard' ||
        name === 'Finance_Dashboard' ||
        name === 'Productivity_Dashboard';
      return {
        properties: {
          sheetId: getSheetId(name),
          title: name,
          gridProperties: {
            rowCount: isDashboard ? 100 : 500,
            columnCount: isDashboard ? 26 : 18,
            frozenRowCount: isDashboard ? 2 : 1,
          },
        },
      };
    });

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

    await this.applyWorkbookStyling(spreadsheetId, accessToken);
    return spreadsheetId;
  }

  /**
   * Runs once at workbook creation: applies headers, per-tab currency/percent formats,
   * banding, inner borders, row heights, alignments, conditional rules, validations,
   * and 5 native Google Sheets charts.
   */
  private async applyWorkbookStyling(spreadsheetId: string, accessToken: string): Promise<void> {
    const data = WORKSHEET_NAMES.map((name) => {
      const headers = WORKSHEET_HEADERS[name];
      const lastColLetter = String.fromCharCode(64 + Math.max(headers.length, 6));
      const isDashboard =
        name === 'Executive_Dashboard' ||
        name === 'Finance_Dashboard' ||
        name === 'Productivity_Dashboard';

      if (isDashboard) {
        return {
          range: `${name}!A1:${lastColLetter}3`,
          values: [
            [
              `FOCUSFLOW & FINANCE — ${name.replace('_', ' ').toUpperCase()}`,
              'Status:',
              'INITIALIZING...',
              'Currency:',
              'INR (₹)',
              'READY',
            ],
            [
              'Strategic intelligence dashboard — synchronized via Cloud Firestore server backend.',
              '',
              '',
              '',
              '',
              '',
            ],
            headers,
          ],
        };
      }

      return {
        range: `${name}!A1:${lastColLetter}1`,
        values: [headers],
      };
    });

    const valuesRes = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
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

    if (!valuesRes.ok) {
      const err = await valuesRes.text();
      throw new Error(`Failed to initialize sheet headers: ${err}`);
    }

    const requests = buildCreateStylingRequests();
    const styleRes = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!styleRes.ok) {
      const err = await styleRes.text();
      throw new Error(`Failed to apply workbook executive styling: ${err}`);
    }
  }

  /**
   * Synchronizes all 23 worksheets in a single values:batchUpdate call,
   * followed by one lightweight autoResizeDimensions batchUpdate so user tweaks
   * (banding, charts, custom colors, validations) remain 100% intact.
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
      paymentHistory?: PaymentHistory[];
      financeSummary?: FinanceSummaryData | null;
      tasks?: Task[];
      envelopes?: BudgetEnvelope[];
      savingsGoals?: SavingsGoal[];
      syncQueue?: DurableSyncOperation[];
      userSettings?: UserSettings | null;
    }
  ): Promise<void> {
    const valueUpdates = buildSyncValueUpdates(data);

    // 1. Single batched value write across all 23 tabs
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
      this.lastError = `Google Sheets synchronization failed: ${err}`;
      throw new Error(this.lastError);
    }

    // 2. Lightweight autoResizeDimensions only (preserves user charts, banding, frozen rows)
    const resizeRes = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: buildSyncResizeRequests() }),
    });

    if (!resizeRes.ok) {
      console.warn('Column auto-resize skipped during sync:', await resizeRes.text().catch(() => ''));
    }

    this.lastError = null;
  }

  /**
   * Deterministic historical resynchronization: clears data rows in all tabs
   * and rewrites the complete historical ledger from the primary Firestore store
   * without deleting or recreating the sheets themselves.
   */
  public async historicalResync(
    spreadsheetId: string,
    accessToken: string,
    data: {
      sessions: FocusSession[];
      focusStats?: FocusStatsData | null;
      incomes: IncomeTransaction[];
      recurring: RecurringExpense[];
      expenses: ExpenseTransaction[];
      bills: Bill[];
      paymentHistory?: PaymentHistory[];
      financeSummary?: FinanceSummaryData | null;
      tasks?: Task[];
      envelopes?: BudgetEnvelope[];
      savingsGoals?: SavingsGoal[];
      syncQueue?: DurableSyncOperation[];
      userSettings?: UserSettings | null;
    }
  ): Promise<void> {
    const clearRanges = WORKSHEET_NAMES.filter(
      (name) =>
        name !== 'Executive_Dashboard' &&
        name !== 'Finance_Dashboard' &&
        name !== 'Productivity_Dashboard'
    ).map((name) => `${name}!A2:Z500`);

    await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ranges: clearRanges }),
    }).catch(() => {});

    await this.syncAllData(spreadsheetId, accessToken, data);
  }

  public getQueueLength(): number {
    return 0;
  }

  /**
   * Enqueue mutation directly to server-side durable queue (Cloud Firestore).
   */
  public async enqueueMutation(
    sheetName: WorksheetName,
    payload: unknown,
    action: DurableSyncOperation['action'] = 'append'
  ): Promise<void> {
    const resolveEntityType = (sheet: WorksheetName): DurableSyncOperation['entityType'] => {
      if (sheet === 'Focus_Sessions') return 'focus_session';
      if (sheet === 'Income') return 'income';
      if (sheet === 'Fixed_Expenses' || sheet === 'Variable_Expenses') return 'expense';
      if (sheet === 'Bills_Payments') return 'bill';
      return 'full_sync';
    };

    try {
      await api.enqueueSync({
        entityType: resolveEntityType(sheetName),
        action,
        sheetName,
        payload,
      });
    } catch (err) {
      console.warn('[Sync] Server queue enqueue failed, will be captured on next full sync:', err);
    }
  }

  /**
   * Flushes pending durable sync operations from Firestore queue to Google Sheets.
   */
  public async flushQueue(spreadsheetId: string, accessToken: string): Promise<number> {
    let pendingOps: DurableSyncOperation[] = [];
    try {
      pendingOps = await api.getSyncQueue();
    } catch {
      return 0;
    }

    if (!pendingOps || pendingOps.length === 0) return 0;

    let processed = 0;
    const now = Date.now();

    for (const op of pendingOps) {
      if (op.status === 'completed') continue;
      if (op.nextRetryAt && op.nextRetryAt > now) continue;

      try {
        if (Array.isArray(op.payload)) {
          const res = await fetch(
            `${SHEETS_API_BASE}/${spreadsheetId}/values/${op.sheetName}!A2:append?valueInputOption=USER_ENTERED`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: [op.payload as (string | number)[]],
              }),
            }
          );

          if (!res.ok) {
            const msg = await res.text().catch(() => `HTTP ${res.status}`);
            throw new Error(msg || `HTTP ${res.status}`);
          }
        }

        await api.updateSyncOpStatus(op.id, {
          status: 'completed',
          errorMessage: undefined,
          lastAttemptAt: new Date().toISOString(),
        });
        processed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Transmission failure';
        const attempts = (op.attempts || 0) + 1;
        const backoffMs = Math.min(300_000, 2000 * Math.pow(2, attempts));
        await api.updateSyncOpStatus(op.id, {
          status: attempts >= 5 ? 'failed' : 'pending',
          attempts,
          errorMessage: errorMsg,
          nextRetryAt: Date.now() + backoffMs,
          lastAttemptAt: new Date().toISOString(),
        });
        this.lastError = errorMsg;
      }
    }

    return processed;
  }
}

export const googleSheetsService = new GoogleSheetsService();
void DRIVE_API_BASE;
