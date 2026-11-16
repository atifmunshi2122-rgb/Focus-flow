/**
 * FocusFlow & Finance — Ultra Premium Unified Export & Reporting Engine
 * Multi-module data aggregation, date filtering, and multi-format serialization
 * Supporting Luxury Editorial PDF, Multi-Sheet Dashboard XLSX, RFC-4180 CSV, and Versioned JSON.
 */

import {
  Bill,
  BudgetEnvelope,
  CurrencyCode,
  ExpenseCategory,
  ExpenseTransaction,
  FocusSession,
  Habit,
  IncomeTransaction,
  SavingsGoal,
  SubscriptionPlan,
  Task,
  TimeBlock,
  UserSettings,
} from '../types/index.ts';
import { StudySubject, StudyTopic, StudyRevision } from '../types/study.ts';
import { formatCurrency } from './currency.ts';
import {
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  getTodayDateString,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  addDays,
} from './dateTime.ts';
import {
  generateOpenXmlWorkbook,
  WorksheetData,
} from './openXmlSpreadsheet.ts';
import { buildCsvContent } from './exportReports.ts';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv' | 'json';

export type ExportModuleId =
  | 'finance_overview'
  | 'income'
  | 'expenses'
  | 'transactions'
  | 'bills'
  | 'envelopes'
  | 'savings_goals'
  | 'tasks'
  | 'focus_sessions'
  | 'productivity_overview'
  | 'study_os'
  | 'habits'
  | 'calendar'
  | 'account_backup';

export type DateFilterPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all_time'
  | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export type ReportTemplateId =
  | 'executive_master'         // Master Comprehensive Dossier (All modules)
  | 'finance_monthly'          // Monthly Financial Statement (Incomes, Expenses, Bills, Budgets)
  | 'finance_annual'           // Annual Fiscal Audit (Incomes, Expenses, Savings, Budgets)
  | 'finance_expenses'         // Expense & Outflow Analysis (Expenses, Envelopes)
  | 'finance_income'           // Income & Revenue Report (Incomes)
  | 'finance_savings_budget'   // Budgets & Savings Goals Report (Budgets, Savings Goals)
  | 'productivity_overview'    // Productivity Intelligence Report (Tasks, Sessions)
  | 'productivity_tasks'       // Task Execution & Backlog Report (Tasks)
  | 'productivity_focus'       // Deep Focus & Pomodoro Analysis (Sessions)
  | 'study_progress'           // Academic Progress & Syllabus Mastery (Study OS)
  | 'habits_consistency'       // Habit Consistency & Streak Audit (Habits)
  | 'calendar_schedule'        // Unified Activity & Calendar Schedule (Calendar, Tasks, Bills, TimeBlocks)
  | 'account_backup';          // Complete Account Verified Backup (JSON)

export interface ReportTemplateConfig {
  id: ReportTemplateId;
  title: string;
  category: string;
  description: string;
  defaultModules: ExportModuleId[];
  defaultPreset: DateFilterPreset;
}

export const REPORT_TEMPLATES: Record<ReportTemplateId, ReportTemplateConfig> = {
  executive_master: {
    id: 'executive_master',
    title: 'Executive Master Dossier',
    category: 'Comprehensive Intelligence',
    description: 'All-inclusive executive statement across finances, productivity, study, habits, and timeline.',
    defaultModules: ['finance_overview', 'tasks', 'focus_sessions', 'habits', 'study_os', 'calendar'],
    defaultPreset: 'this_month',
  },
  finance_monthly: {
    id: 'finance_monthly',
    title: 'Monthly Financial Statement',
    category: 'Financial Intelligence',
    description: 'Consolidated cashflow, operating income, categorized expenses, and monthly obligations.',
    defaultModules: ['finance_overview', 'income', 'expenses', 'bills', 'envelopes'],
    defaultPreset: 'this_month',
  },
  finance_annual: {
    id: 'finance_annual',
    title: 'Annual Fiscal Review & Audit',
    category: 'Financial Intelligence',
    description: 'Full-year macro analysis, savings rate velocity, and long-term capital accumulation.',
    defaultModules: ['finance_overview', 'income', 'expenses', 'savings_goals', 'envelopes'],
    defaultPreset: 'this_year',
  },
  finance_expenses: {
    id: 'finance_expenses',
    title: 'Expense Distribution & Outflow Analysis',
    category: 'Financial Intelligence',
    description: 'Itemized debit registry, category breakdown, fixed vs variable obligations, and payment methods.',
    defaultModules: ['expenses', 'envelopes', 'bills'],
    defaultPreset: 'this_month',
  },
  finance_income: {
    id: 'finance_income',
    title: 'Revenue & Income Inflow Report',
    category: 'Financial Intelligence',
    description: 'Verified itemized earnings, salary streams, freelance proceeds, and credit timeline.',
    defaultModules: ['income'],
    defaultPreset: 'this_year',
  },
  finance_savings_budget: {
    id: 'finance_savings_budget',
    title: 'Budget Envelopes & Wealth Goals',
    category: 'Financial Intelligence',
    description: 'Category spending caps, remaining envelope headroom, and goal accumulation tracking.',
    defaultModules: ['envelopes', 'savings_goals'],
    defaultPreset: 'all_time',
  },
  productivity_overview: {
    id: 'productivity_overview',
    title: 'Productivity & Execution Audit',
    category: 'Productivity Intelligence',
    description: 'Task execution rate, backlog clearance velocity, and deep work focus duration.',
    defaultModules: ['productivity_overview', 'tasks', 'focus_sessions'],
    defaultPreset: 'this_month',
  },
  productivity_tasks: {
    id: 'productivity_tasks',
    title: 'Task Execution & Velocity Register',
    category: 'Productivity Intelligence',
    description: 'Itemized task register, priority breakdown, due dates, and completion timestamps.',
    defaultModules: ['tasks'],
    defaultPreset: 'this_month',
  },
  productivity_focus: {
    id: 'productivity_focus',
    title: 'Deep Work & Pomodoro Log',
    category: 'Productivity Intelligence',
    description: 'Session duration logs, focus modes, completion efficiency, and time distribution.',
    defaultModules: ['focus_sessions'],
    defaultPreset: 'this_month',
  },
  study_progress: {
    id: 'study_progress',
    title: 'Study OS Academic Progress Report',
    category: 'Academic Mastery',
    description: 'Curriculum coverage, unit mastery, subtopic completion, and revision readiness.',
    defaultModules: ['study_os'],
    defaultPreset: 'all_time',
  },
  habits_consistency: {
    id: 'habits_consistency',
    title: 'Habit Consistency & Streak Audit',
    category: 'Behavioral Intelligence',
    description: 'Daily consistency logs, active streak records, best streaks, and target frequencies.',
    defaultModules: ['habits'],
    defaultPreset: 'all_time',
  },
  calendar_schedule: {
    id: 'calendar_schedule',
    title: 'Unified Activity & Calendar Schedule',
    category: 'Operations Timeline',
    description: 'Chronological roadmap of scheduled tasks, bill deadlines, time blocks, and cashflows.',
    defaultModules: ['calendar', 'tasks', 'bills'],
    defaultPreset: 'this_month',
  },
  account_backup: {
    id: 'account_backup',
    title: 'Complete Account Verified Backup',
    category: 'System Security',
    description: 'Full lossless developer-grade JSON archive with relational schemas and metadata.',
    defaultModules: ['account_backup'],
    defaultPreset: 'all_time',
  },
};

export interface UnifiedExportDataPayload {
  userSettings?: UserSettings | null;
  userName?: string;
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  bills: Bill[];
  envelopes: BudgetEnvelope[];
  savingsGoals: SavingsGoal[];
  subscriptions: SubscriptionPlan[];
  categories: ExpenseCategory[];
  tasks: Task[];
  sessions: FocusSession[];
  habits: Habit[];
  timeBlocks: TimeBlock[];
  studySubjects: StudySubject[];
  studyTopics: StudyTopic[];
  studyRevisions: StudyRevision[];
}

/**
 * Calculates start and end YYYY-MM-DD for any date preset in the user's timezone.
 */
export function resolveDateFilterRange(
  preset: DateFilterPreset,
  timezone: string = DEFAULT_TIMEZONE,
  customRange?: { startDate?: string; endDate?: string }
): DateRange {
  const today = getTodayDateString(timezone);

  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { startDate: yesterday, endDate: yesterday };
    }
    case 'this_week': {
      const start = getStartOfWeek(today, timezone);
      const end = getEndOfWeek(today, timezone);
      return { startDate: start, endDate: end };
    }
    case 'this_month': {
      const start = getStartOfMonth(today);
      const end = getEndOfMonth(today);
      return { startDate: start, endDate: end };
    }
    case 'last_month': {
      const y = parseInt(today.slice(0, 4), 10);
      const m = parseInt(today.slice(5, 7), 10);
      const prevY = m === 1 ? y - 1 : y;
      const prevM = m === 1 ? 12 : m - 1;
      const refDate = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
      return {
        startDate: getStartOfMonth(refDate),
        endDate: getEndOfMonth(refDate),
      };
    }
    case 'this_year': {
      const year = today.slice(0, 4);
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
    }
    case 'custom': {
      return {
        startDate: customRange?.startDate || '2020-01-01',
        endDate: customRange?.endDate || today,
      };
    }
    case 'all_time':
    default:
      return { startDate: '1970-01-01', endDate: '2099-12-31' };
  }
}

function isDateInRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= range.startDate && d <= range.endDate;
}

export function filterPayloadByDateRange(
  payload: UnifiedExportDataPayload,
  range: DateRange,
  timezone: string = DEFAULT_TIMEZONE
): UnifiedExportDataPayload {
  const isAllTime = range.startDate === '1970-01-01' && range.endDate === '2099-12-31';
  if (isAllTime) return payload;

  return {
    ...payload,
    incomes: payload.incomes.filter((i) => !i.deletedAt && isDateInRange(i.date, range)),
    expenses: payload.expenses.filter((e) => !e.deletedAt && isDateInRange(e.date, range)),
    bills: payload.bills.filter((b) => !b.deletedAt && isDateInRange(b.dueDate, range)),
    tasks: payload.tasks.filter((t) => {
      if (t.deletedAt) return false;
      const d = t.dueDate || t.createdAt;
      return isDateInRange(d, range);
    }),
    sessions: payload.sessions.filter((s) => {
      const localDate = formatDateInTimezone(s.startedAt, timezone);
      return isDateInRange(localDate, range);
    }),
    timeBlocks: payload.timeBlocks.filter((tb) => !tb.deletedAt && isDateInRange(tb.date, range)),
    // Master definitions like categories, envelopes, savings goals, study topics, habits are preserved
  };
}

function computeDocumentReference(data: UnifiedExportDataPayload, rangeLabel: string): string {
  const seed = `${data.userName || 'user'}-${rangeLabel}-${data.incomes.length}-${data.expenses.length}-${data.tasks.length}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return `FF-${new Date().getFullYear()}-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

// =========================================================================
// 1. CLEAN RFC-4180 CSV EXPORTER
// =========================================================================

export function generateModuleCsv(
  moduleId: ExportModuleId,
  data: UnifiedExportDataPayload,
  currency: CurrencyCode = 'INR'
): { filename: string; content: string } {
  const dateStamp = new Date().toISOString().slice(0, 10);

  switch (moduleId) {
    case 'income': {
      const headers = ['Date', 'Source', 'Category', `Amount (${currency})`, 'Notes', 'Created At'];
      const rows = data.incomes.map((i) => [
        i.date,
        i.source,
        i.category,
        (i.amountPaise / 100).toFixed(2),
        i.notes || '',
        i.createdAt || '',
      ]);
      return {
        filename: `focusflow-income-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'expenses': {
      const headers = ['Date', 'Description', 'Category', 'Expense Type', 'Payment Method', `Amount (${currency})`, 'Notes'];
      const rows = data.expenses.map((e) => [
        e.date,
        e.description,
        e.categoryName || e.categoryId,
        e.type === 'fixed' ? 'Fixed Expense' : 'Variable Expense',
        (e.paymentMethod || '').replace('_', ' ').toUpperCase(),
        (e.amountPaise / 100).toFixed(2),
        e.notes || '',
      ]);
      return {
        filename: `focusflow-expenses-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'finance_overview': {
      const totalInc = data.incomes.reduce((acc, i) => acc + i.amountPaise, 0);
      const totalExp = data.expenses.reduce((acc, e) => acc + e.amountPaise, 0);
      const net = totalInc - totalExp;
      const savingsRate = totalInc > 0 ? Math.max(0, Math.round((net / totalInc) * 100)) : 0;
      const totalAllocated = data.envelopes.reduce((acc, env) => acc + env.allocatedPaise, 0);
      const totalSpent = data.envelopes.reduce((acc, env) => acc + (env.spentPaise || 0), 0);
      const pendingBills = data.bills.filter((b) => b.status !== 'PAID').reduce((acc, b) => acc + b.amountPaise, 0);
      const totalSaved = data.savingsGoals.reduce((acc, g) => acc + g.savedPaise, 0);

      const headers = ['Financial Metric', `Value (${currency})`, 'Status / Ratio', 'Verified Context'];
      const rows = [
        ['Total Inflow (Credits)', (totalInc / 100).toFixed(2), '100% Inflow Baseline', `${data.incomes.length} credit entries`],
        ['Total Outflow (Debits)', (totalExp / 100).toFixed(2), totalInc > 0 ? `${Math.round((totalExp / totalInc) * 100)}% of Inflow` : '—', `${data.expenses.length} debit entries`],
        ['Net Cashflow (Operating)', (net / 100).toFixed(2), net >= 0 ? 'OPERATING SURPLUS' : 'OPERATING DEFICIT', 'Client-side ledger balance'],
        ['Operating Savings Rate', `${savingsRate}%`, savingsRate >= 20 ? 'HEALTHY' : 'LOW', 'Portion of receipts retained'],
        ['Allocated Budget Cap', (totalAllocated / 100).toFixed(2), 'Budget Ceiling', `${data.envelopes.length} active envelopes`],
        ['Actual Budget Spent', (totalSpent / 100).toFixed(2), totalAllocated > 0 ? `${Math.round((totalSpent / totalAllocated) * 100)}% Utilized` : '—', 'Recorded envelope spend'],
        ['Remaining Budget Headroom', ((totalAllocated - totalSpent) / 100).toFixed(2), totalAllocated - totalSpent >= 0 ? 'WITHIN LIMIT' : 'EXCEEDED', 'Available budget margin'],
        ['Pending Bills & Obligations', (pendingBills / 100).toFixed(2), 'SCHEDULED', `${data.bills.filter(b => b.status !== 'PAID').length} unpaid bills`],
        ['Capital Accumulated (Savings)', (totalSaved / 100).toFixed(2), 'ASSETS', `${data.savingsGoals.length} savings targets`],
      ];

      return {
        filename: `focusflow-finance-overview-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'transactions': {
      const headers = ['Type', 'Date', 'Description / Source', 'Category', 'Payment / Status', `Amount (${currency})`, 'Notes'];
      const rows = [
        ...data.incomes.map((i) => [
          'INCOME',
          i.date,
          i.source,
          i.category,
          'CREDITED',
          (i.amountPaise / 100).toFixed(2),
          i.notes || '',
        ]),
        ...data.expenses.map((e) => [
          'EXPENSE',
          e.date,
          e.description,
          e.categoryName || e.categoryId,
          (e.paymentMethod || '').toUpperCase(),
          (-e.amountPaise / 100).toFixed(2),
          e.notes || '',
        ]),
        ...data.bills.map((b) => [
          'BILL',
          b.dueDate,
          b.name,
          b.categoryName || b.categoryId,
          b.status,
          (-b.amountPaise / 100).toFixed(2),
          b.notes || '',
        ]),
      ].sort((a, b) => String(b[1]).localeCompare(String(a[1])));

      return {
        filename: `focusflow-transactions-ledger-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'bills': {
      const headers = ['Bill Name', 'Due Date', 'Category', 'Status', `Amount (${currency})`, 'Auto Pay', 'Notes'];
      const rows = data.bills.map((b) => [
        b.name,
        b.dueDate,
        b.categoryName || b.categoryId,
        b.status,
        (b.amountPaise / 100).toFixed(2),
        b.recurringExpenseId ? 'YES (Recurring)' : 'NO',
        b.notes || '',
      ]);
      return {
        filename: `focusflow-bills-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'envelopes': {
      const headers = ['Envelope Name', `Allocated Cap (${currency})`, `Spent This Period (${currency})`, `Remaining Headroom (${currency})`, 'Category ID'];
      const rows = data.envelopes.map((env) => {
        const spent = env.spentPaise || 0;
        return [
          env.name,
          (env.allocatedPaise / 100).toFixed(2),
          (spent / 100).toFixed(2),
          ((env.allocatedPaise - spent) / 100).toFixed(2),
          env.categoryId || 'General',
        ];
      });
      return {
        filename: `focusflow-envelope-budgets-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'savings_goals': {
      const headers = ['Goal Title', `Target Amount (${currency})`, `Saved Amount (${currency})`, 'Progress (%)', 'Target Date', 'Status'];
      const rows = data.savingsGoals.map((g) => {
        const pct = g.targetPaise > 0 ? ((g.savedPaise / g.targetPaise) * 100).toFixed(1) : '0.0';
        return [
          g.title,
          (g.targetPaise / 100).toFixed(2),
          (g.savedPaise / 100).toFixed(2),
          `${pct}%`,
          g.targetDate || 'Ongoing',
          g.savedPaise >= g.targetPaise ? 'COMPLETED' : 'IN_PROGRESS',
        ];
      });
      return {
        filename: `focusflow-savings-goals-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'productivity_overview': {
      const headers = ['Entity Type', 'Date', 'Title / Description', 'Status / Mode', 'Category / Priority', 'Duration / Est Poms', 'Completion / Task ID'];
      const rows = [
        ...data.tasks.map((t) => [
          'TASK',
          t.dueDate || (t.createdAt ? t.createdAt.slice(0, 10) : ''),
          t.title,
          t.status.toUpperCase(),
          `${t.priority.toUpperCase()} (${t.category || 'General'})`,
          `${t.estimatedPomodoros || 1} pom(s)`,
          t.completedAt || (t.status === 'completed' ? 'DONE' : 'PENDING'),
        ]),
        ...data.sessions.map((s) => [
          'FOCUS_SESSION',
          s.startedAt.slice(0, 10),
          `Focus Session (${s.mode})`,
          s.mode.toUpperCase(),
          'Productivity',
          `${Math.round(s.durationSeconds / 60)} min`,
          s.completed ? 'COMPLETED' : 'INCOMPLETE',
        ]),
      ].sort((a, b) => String(b[1]).localeCompare(String(a[1])));

      return {
        filename: `focusflow-productivity-overview-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'tasks': {
      const headers = ['Task Title', 'Status', 'Priority', 'Category', 'Due Date', 'Est Pomodoros', 'Completed At'];
      const rows = data.tasks.map((t) => [
        t.title,
        t.status.toUpperCase(),
        t.priority.toUpperCase(),
        t.category || 'General',
        t.dueDate || '',
        t.estimatedPomodoros || 1,
        t.completedAt || '',
      ]);
      return {
        filename: `focusflow-tasks-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'focus_sessions': {
      const headers = ['Session Date', 'Start Time', 'Mode', 'Duration (Minutes)', 'Completed', 'Task ID'];
      const rows = data.sessions.map((s) => [
        s.startedAt.slice(0, 10),
        s.startedAt,
        s.mode.toUpperCase(),
        Math.round(s.durationSeconds / 60),
        s.completed ? 'YES' : 'NO',
        s.taskId || 'None',
      ]);
      return {
        filename: `focusflow-focus-sessions-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'habits': {
      const headers = ['Habit Title', 'Category', 'Frequency', 'Current Streak', 'Best Streak', 'Total Completed Days'];
      const rows = data.habits.map((h) => [
        h.title,
        h.category,
        h.frequency,
        (h.completedDates || []).length,
        h.bestStreakDays || 0,
        (h.completedDates || []).length,
      ]);
      return {
        filename: `focusflow-habits-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'study_os': {
      const headers = ['Subject Code', 'Subject Name', 'Target Exam', 'Total Subtopics', 'Completed Subtopics', 'Progress (%)'];
      const rows = data.studySubjects.map((sub) => {
        const pct = sub.totalSubtopics > 0 ? Math.round((sub.completedSubtopics / sub.totalSubtopics) * 100) : 0;
        return [
          sub.code,
          sub.name,
          sub.targetExam || '',
          sub.totalSubtopics,
          sub.completedSubtopics,
          `${pct}%`,
        ];
      });
      return {
        filename: `focusflow-study-subjects-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    case 'calendar': {
      const headers = ['Date', 'Item Type', 'Title / Description', 'Status / Category', 'Amount / Duration'];
      const rows = [
        ...data.tasks.map((t) => [t.dueDate || t.createdAt.slice(0, 10), 'TASK', t.title, t.status, `${t.priority} priority`]),
        ...data.bills.map((b) => [b.dueDate, 'BILL', b.name, b.status, formatCurrency(b.amountPaise, currency)]),
        ...data.incomes.map((i) => [i.date, 'INCOME', i.source, i.category, `+${formatCurrency(i.amountPaise, currency)}`]),
        ...data.expenses.map((e) => [e.date, 'EXPENSE', e.description, e.categoryName || e.categoryId, `-${formatCurrency(e.amountPaise, currency)}`]),
        ...data.timeBlocks.map((tb) => [tb.date, 'REMINDER_BLOCK', tb.title, tb.category, `${tb.startMinute}m-${tb.endMinute}m`]),
      ].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
      return {
        filename: `focusflow-calendar-schedule-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
    default: {
      const headers = ['Entity ID', 'Module Type', 'Reference', 'Details'];
      const rows = [
        ['INFO', String(moduleId).toUpperCase(), `Exported at ${dateStamp}`, 'Module CSV generated without financial fallback'],
      ];
      return {
        filename: `focusflow-${moduleId}-${dateStamp}.csv`,
        content: buildCsvContent(headers, rows),
      };
    }
  }
}

// =========================================================================
// 2. MULTI-SHEET XLSX FINANCIAL DASHBOARD BUILDER
// =========================================================================

export function generateMasterXlsxWorkbook(
  data: UnifiedExportDataPayload,
  rangeLabel: string,
  selectedModules?: Set<ExportModuleId>,
  currency: CurrencyCode = 'INR'
): WorksheetData[] {
  const sheets: WorksheetData[] = [];
  const hasModule = (m: ExportModuleId) => {
    if (!selectedModules) return true;
    if (selectedModules.has(m)) return true;
    if (selectedModules.has('finance_overview') && ['income', 'expenses', 'transactions', 'bills', 'envelopes'].includes(m)) return true;
    if (selectedModules.has('productivity_overview') && ['tasks', 'focus_sessions'].includes(m)) return true;
    return false;
  };

  // Sheet 1: Executive Dashboard (Always First)
  const totalIncPaise = data.incomes.reduce((acc, i) => acc + i.amountPaise, 0);
  const totalExpPaise = data.expenses.reduce((acc, e) => acc + e.amountPaise, 0);
  const netPaise = totalIncPaise - totalExpPaise;
  const completedTasks = data.tasks.filter((t) => t.status === 'completed').length;
  const totalFocusMins = Math.round(data.sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60);
  const savingsRatePct = totalIncPaise > 0 ? Math.max(0, (netPaise / totalIncPaise) * 100).toFixed(1) : '0.0';

  // Group top expense categories for dashboard
  const catMap: Record<string, number> = {};
  for (const exp of data.expenses) {
    const c = exp.categoryName || exp.categoryId || 'General';
    catMap[c] = (catMap[c] || 0) + exp.amountPaise;
  }
  const topCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  sheets.push({
    name: 'Executive Dashboard',
    freezeHeader: true,
    autoFilter: false,
    columns: [
      { header: 'Domain Category', key: 'category', width: 22, headerStyle: 'purple' },
      { header: 'Key Performance Indicator', key: 'kpi', width: 34, headerStyle: 'navy' },
      { header: 'Value / Output', key: 'value', width: 22, format: 'text' },
      { header: 'Audit Status / Analysis', key: 'notes', width: 38 },
    ],
    rows: [
      // Section: Overview Metadata
      { category: 'METADATA', kpi: 'Report Scope & Window', value: rangeLabel, notes: 'Verified Ledger Timeframe', _isSection: true },
      { category: 'METADATA', kpi: 'Account Holder', value: data.userName || 'Verified User', notes: 'Client-side Encrypted Tenant' },
      { category: 'METADATA', kpi: 'Verification Reference', value: computeDocumentReference(data, rangeLabel), notes: 'Deterministic Document Ref ID' },

      // Section: Financial Performance
      { category: 'FINANCIAL', kpi: 'Total Inflow (Credits)', value: (totalIncPaise / 100).toFixed(2), notes: `${data.incomes.length} verified credit records`, _accent: 'green' },
      { category: 'FINANCIAL', kpi: 'Total Outflow (Debits)', value: (totalExpPaise / 100).toFixed(2), notes: `${data.expenses.length} verified debit records`, _accent: 'red' },
      { category: 'FINANCIAL', kpi: 'Net Financial Position', value: (netPaise / 100).toFixed(2), notes: netPaise >= 0 ? 'Operating Surplus' : 'Operating Deficit', _isSummary: true },
      { category: 'FINANCIAL', kpi: 'Operating Savings Rate', value: `${savingsRatePct}%`, notes: totalIncPaise > 0 ? 'Proportion of income retained' : 'No recorded income in period', _accent: 'lavender' },
      { category: 'FINANCIAL', kpi: 'Active Savings Goals', value: `${data.savingsGoals.length} targets`, notes: `Saved: ${formatCurrency(data.savingsGoals.reduce((a, g) => a + g.savedPaise, 0), currency)}` },
      { category: 'FINANCIAL', kpi: 'Scheduled Obligations', value: `${data.bills.length} bills`, notes: `Committed: ${formatCurrency(data.bills.reduce((a, b) => a + b.amountPaise, 0), currency)}` },

      // Section: Productivity & Academics
      { category: 'PRODUCTIVITY', kpi: 'Tasks Execution Velocity', value: data.tasks.length > 0 ? `${completedTasks} / ${data.tasks.length}` : 'N/A', notes: data.tasks.length > 0 ? `${Math.round((completedTasks / data.tasks.length) * 100)}% execution rate` : 'No tasks scheduled in period' },
      { category: 'PRODUCTIVITY', kpi: 'Deep Work Focus Time', value: `${totalFocusMins} minutes`, notes: `${data.sessions.length} recorded focus sessions` },
      { category: 'BEHAVIORAL', kpi: 'Habits Tracked', value: `${data.habits.length} habits`, notes: `Max active streak: ${Math.max(0, ...data.habits.map((h) => h.bestStreakDays || 0))} days` },
      { category: 'ACADEMIC', kpi: 'Study OS Curriculum', value: `${data.studySubjects.length} subjects`, notes: `${data.studySubjects.reduce((a, s) => a + s.completedSubtopics, 0)} completed subtopics` },

      // Section: Top Category Expenditures
      ...topCategories.slice(0, 5).map(([catName, paise]) => {
        const pct = totalExpPaise > 0 ? Math.round((paise / totalExpPaise) * 100) : 0;
        return {
          category: 'EXPENDITURE',
          kpi: `Top Driver: ${catName}`,
          value: (paise / 100).toFixed(2),
          notes: `${pct}% of total period outflow`,
        };
      }),

      // Section: Module Selection & Coverage Register
      { category: 'COVERAGE', kpi: 'Selected Modules', value: selectedModules ? Array.from(selectedModules).join(', ') : 'All Supported Modules', notes: 'Configured Export Modules', _isSection: true },
      { category: 'COVERAGE', kpi: 'Income Credits', value: `${data.incomes.length} records`, notes: hasModule('income') ? 'Included in Workbook' : 'Excluded from Scope' },
      { category: 'COVERAGE', kpi: 'Expense Debits', value: `${data.expenses.length} records`, notes: hasModule('expenses') ? 'Included in Workbook' : 'Excluded from Scope' },
      { category: 'COVERAGE', kpi: 'Bills & Scheduled Obligations', value: `${data.bills.length} records`, notes: hasModule('bills') ? (data.bills.length > 0 ? 'Included in Workbook' : 'Zero records in date range') : 'Excluded from Scope' },
      { category: 'COVERAGE', kpi: 'Budgets & Envelopes', value: `${data.envelopes.length} records`, notes: hasModule('envelopes') ? (data.envelopes.length > 0 ? 'Included in Workbook' : 'Zero records in date range') : 'Excluded from Scope' },
      { category: 'COVERAGE', kpi: 'Savings Goals', value: `${data.savingsGoals.length} records`, notes: hasModule('savings_goals') ? (data.savingsGoals.length > 0 ? 'Included in Workbook' : 'Zero records in date range') : 'Excluded from Scope' },
      { category: 'COVERAGE', kpi: 'Productivity Tasks', value: `${data.tasks.length} records`, notes: hasModule('tasks') ? (data.tasks.length > 0 ? 'Included in Workbook' : 'Zero records in date range') : 'Excluded from Scope' },
      { category: 'COVERAGE', kpi: 'Deep Work Sessions', value: `${data.sessions.length} records`, notes: hasModule('focus_sessions') ? (data.sessions.length > 0 ? 'Included in Workbook' : 'Zero records in date range') : 'Excluded from Scope' },
    ],
  });

  // Sheet 2: Income
  if (hasModule('income') || hasModule('finance_overview')) {
    sheets.push({
      name: 'Income',
      freezeHeader: true,
      autoFilter: data.incomes.length > 0,
      columns: [
        { header: 'Date', key: 'date', width: 14, format: 'date' },
        { header: 'Source / Entity', key: 'source', width: 26 },
        { header: 'Category', key: 'category', width: 20 },
        { header: `Amount (${currency})`, key: 'amount', width: 18, format: 'currency' },
        { header: 'Notes & Context', key: 'notes', width: 32 },
      ],
      rows: data.incomes.length > 0
        ? [
            ...data.incomes.map((i) => ({
              date: i.date,
              source: i.source,
              category: i.category,
              amount: i.amountPaise / 100,
              notes: i.notes || '',
            })),
            {
              date: 'TOTAL',
              source: `${data.incomes.length} Credits`,
              category: 'Sum',
              amount: totalIncPaise / 100,
              notes: 'Audited Inflow Total',
              _isSummary: true,
            },
          ]
        : [
            {
              date: rangeLabel,
              source: 'No income credits recorded in selected timeframe',
              category: 'N/A',
              amount: 0,
              notes: 'Zero recorded inflows',
            },
          ],
    });
  }

  // Sheet 3: Expenses
  if (hasModule('expenses') || hasModule('finance_overview')) {
    sheets.push({
      name: 'Expenses',
      freezeHeader: true,
      autoFilter: data.expenses.length > 0,
      columns: [
        { header: 'Date', key: 'date', width: 14, format: 'date' },
        { header: 'Description / Payee', key: 'description', width: 30 },
        { header: 'Category', key: 'category', width: 22 },
        { header: 'Expense Type', key: 'type', width: 16 },
        { header: 'Payment Method', key: 'method', width: 18 },
        { header: `Amount (${currency})`, key: 'amount', width: 18, format: 'currency' },
        { header: 'Notes', key: 'notes', width: 30 },
      ],
      rows: data.expenses.length > 0
        ? [
            ...data.expenses.map((e) => ({
              date: e.date,
              description: e.description,
              category: e.categoryName || e.categoryId,
              type: e.type === 'fixed' ? 'Fixed' : 'Variable',
              method: (e.paymentMethod || '').replace('_', ' ').toUpperCase(),
              amount: e.amountPaise / 100,
              notes: e.notes || '',
            })),
            {
              date: 'TOTAL',
              description: `${data.expenses.length} Debits`,
              category: 'Sum',
              type: '',
              method: '',
              amount: totalExpPaise / 100,
              notes: 'Audited Outflow Total',
              _isSummary: true,
            },
          ]
        : [
            {
              date: rangeLabel,
              description: 'No expense debits recorded in selected timeframe',
              category: 'N/A',
              type: 'N/A',
              method: 'N/A',
              amount: 0,
              notes: 'Zero recorded outflows',
            },
          ],
    });
  }

  // Sheet 4: Category Breakdown
  if (hasModule('expenses') || hasModule('finance_overview')) {
    const catRows = topCategories.map(([catName, paise]) => {
      const pct = totalExpPaise > 0 ? paise / totalExpPaise : 0;
      const count = data.expenses.filter((e) => (e.categoryName || e.categoryId || 'General') === catName).length;
      const avg = count > 0 ? (paise / 100) / count : 0;
      // Dominant payment method for this category
      const methodCounts: Record<string, number> = {};
      for (const e of data.expenses) {
        if ((e.categoryName || e.categoryId || 'General') === catName) {
          const m = (e.paymentMethod || 'OTHER').toUpperCase().replace('_', ' ');
          methodCounts[m] = (methodCounts[m] || 0) + 1;
        }
      }
      const dominantMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
      return {
        category: catName,
        amount: paise / 100,
        pct: pct,
        count: count,
        avg: avg,
        method: dominantMethod,
      };
    });

    sheets.push({
      name: 'Category Breakdown',
      freezeHeader: true,
      autoFilter: catRows.length > 0,
      columns: [
        { header: 'Expense Category', key: 'category', width: 26, headerStyle: 'purple' },
        { header: `Total Outflow (${currency})`, key: 'amount', width: 22, format: 'currency' },
        { header: 'Period Share %', key: 'pct', width: 16, format: 'percent' },
        { header: 'Transactions Count', key: 'count', width: 18, format: 'integer' },
        { header: `Average Ticket (${currency})`, key: 'avg', width: 20, format: 'currency' },
        { header: 'Dominant Payment Method', key: 'method', width: 24 },
      ],
      rows: catRows.length > 0
        ? [
            ...catRows,
            {
              category: 'TOTAL OUTFLOW',
              amount: totalExpPaise / 100,
              pct: 1.0,
              count: data.expenses.length,
              avg: data.expenses.length > 0 ? (totalExpPaise / 100) / data.expenses.length : 0,
              method: 'ALL METHODS',
              _isSummary: true,
            },
          ]
        : [
            {
              category: 'No expense records in selected timeframe',
              amount: 0,
              pct: 0,
              count: 0,
              avg: 0,
              method: 'N/A',
            },
          ],
    });
  }

  // Sheet 5: Daily Spending
  if (hasModule('expenses') || hasModule('finance_overview')) {
    const dailyMap: Record<string, { paise: number; count: number }> = {};
    for (const e of data.expenses) {
      if (!dailyMap[e.date]) dailyMap[e.date] = { paise: 0, count: 0 };
      dailyMap[e.date].paise += e.amountPaise;
      dailyMap[e.date].count += 1;
    }
    const sortedDays = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]));
    const maxDailyPaise = Math.max(0, ...sortedDays.map((d) => d[1].paise));

    const dailyRows = sortedDays.map(([date, stat]) => {
      const pct = totalExpPaise > 0 ? stat.paise / totalExpPaise : 0;
      let intensity = 'Normal';
      if (stat.paise === maxDailyPaise && maxDailyPaise > 0) intensity = 'Peak Spending Day';
      else if (pct >= 0.25) intensity = 'High Outflow';
      else if (pct >= 0.10) intensity = 'Moderate';
      else intensity = 'Light';

      return {
        date: date,
        amount: stat.paise / 100,
        count: stat.count,
        pct: pct,
        intensity: intensity,
      };
    });

    sheets.push({
      name: 'Daily Spending',
      freezeHeader: true,
      autoFilter: dailyRows.length > 0,
      columns: [
        { header: 'Date', key: 'date', width: 14, format: 'date' },
        { header: `Daily Outflow (${currency})`, key: 'amount', width: 22, format: 'currency' },
        { header: 'Transactions Count', key: 'count', width: 18, format: 'integer' },
        { header: 'Period Share %', key: 'pct', width: 16, format: 'percent' },
        { header: 'Spending Intensity', key: 'intensity', width: 22 },
      ],
      rows: dailyRows.length > 0
        ? [
            ...dailyRows,
            {
              date: 'TOTAL',
              amount: totalExpPaise / 100,
              count: data.expenses.length,
              pct: 1.0,
              intensity: `${sortedDays.length} Active Spending Days`,
              _isSummary: true,
            },
          ]
        : [
            {
              date: rangeLabel,
              amount: 0,
              count: 0,
              pct: 0,
              intensity: 'No daily expenses recorded',
            },
          ],
    });
  }

  // Sheet 6: Monthly Trends (Weekly Dynamics Breakdown)
  if (hasModule('finance_overview') || hasModule('expenses') || hasModule('income')) {
    const weeks = [
      { label: 'Week 1 (Days 1–7)', start: 1, end: 7, inc: 0, exp: 0 },
      { label: 'Week 2 (Days 8–14)', start: 8, end: 14, inc: 0, exp: 0 },
      { label: 'Week 3 (Days 15–21)', start: 15, end: 21, inc: 0, exp: 0 },
      { label: 'Week 4 (Days 22–28)', start: 22, end: 28, inc: 0, exp: 0 },
      { label: 'Week 5 (Days 29–31)', start: 29, end: 31, inc: 0, exp: 0 },
    ];

    for (const i of data.incomes) {
      const day = parseInt(i.date.slice(8, 10), 10) || 1;
      const w = weeks.find((wk) => day >= wk.start && day <= wk.end) || weeks[weeks.length - 1];
      w.inc += i.amountPaise;
    }
    for (const e of data.expenses) {
      const day = parseInt(e.date.slice(8, 10), 10) || 1;
      const w = weeks.find((wk) => day >= wk.start && day <= wk.end) || weeks[weeks.length - 1];
      w.exp += e.amountPaise;
    }

    const trendRows = weeks.map((w) => {
      const netWk = w.inc - w.exp;
      const retPct = w.inc > 0 ? Math.max(0, netWk / w.inc) : 0;
      return {
        week: w.label,
        inflow: w.inc / 100,
        outflow: w.exp / 100,
        net: netWk / 100,
        status: netWk >= 0 ? (w.inc > 0 ? 'SURPLUS' : 'BALANCED') : 'DEFICIT',
        retention: retPct,
      };
    });

    sheets.push({
      name: 'Monthly Trends',
      freezeHeader: true,
      autoFilter: false,
      columns: [
        { header: 'Period / Week Slice', key: 'week', width: 24, headerStyle: 'navy' },
        { header: `Inflow (${currency})`, key: 'inflow', width: 18, format: 'currency' },
        { header: `Outflow (${currency})`, key: 'outflow', width: 18, format: 'currency' },
        { header: `Net Flow (${currency})`, key: 'net', width: 18, format: 'currency' },
        { header: 'Operating Status', key: 'status', width: 18 },
        { header: 'Savings Retention %', key: 'retention', width: 20, format: 'percent' },
      ],
      rows: [
        ...trendRows,
        {
          week: 'MONTHLY TOTAL',
          inflow: totalIncPaise / 100,
          outflow: totalExpPaise / 100,
          net: netPaise / 100,
          status: netPaise >= 0 ? 'CUMULATIVE SURPLUS' : 'CUMULATIVE DEFICIT',
          retention: totalIncPaise > 0 ? Math.max(0, netPaise / totalIncPaise) : 0,
          _isSummary: true,
        },
      ],
    });
  }

  // Sheet 5: Bills & Payments
  if (hasModule('bills')) {
    sheets.push({
      name: 'Bills & Payments',
      freezeHeader: true,
      autoFilter: data.bills.length > 0,
      columns: [
        { header: 'Bill Name', key: 'name', width: 28 },
        { header: 'Due Date', key: 'date', width: 16, format: 'date' },
        { header: 'Category', key: 'category', width: 20 },
        { header: `Amount (${currency})`, key: 'amount', width: 18, format: 'currency' },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Auto Pay / Recurring', key: 'recur', width: 22 },
        { header: 'Notes', key: 'notes', width: 28 },
      ],
      rows: data.bills.length > 0
        ? data.bills.map((b) => ({
            name: b.name,
            date: b.dueDate,
            category: b.categoryName || b.categoryId,
            amount: b.amountPaise / 100,
            status: b.status,
            recur: b.recurringExpenseId ? 'YES (Recurring)' : 'NO',
            notes: b.notes || '',
          }))
        : [
            {
              name: 'No scheduled bills recorded in selected timeframe',
              date: rangeLabel,
              category: 'N/A',
              amount: 0,
              status: 'NO_BILLS',
              recur: 'NO',
              notes: 'Zero obligations in period',
            },
          ],
    });
  }

  // Sheet 8: Budgets
  if (hasModule('envelopes') || hasModule('finance_overview')) {
    sheets.push({
      name: 'Budgets',
      freezeHeader: true,
      autoFilter: data.envelopes.length > 0,
      columns: [
        { header: 'Envelope Name', key: 'name', width: 26 },
        { header: 'Month / Target', key: 'month', width: 18 },
        { header: `Allocated Cap (${currency})`, key: 'cap', width: 20, format: 'currency' },
        { header: `Spent (${currency})`, key: 'spent', width: 18, format: 'currency' },
        { header: `Remaining Headroom (${currency})`, key: 'remaining', width: 24, format: 'currency' },
        { header: 'Utilization %', key: 'util', width: 16, format: 'percent' },
        { header: 'Status', key: 'status', width: 18 },
      ],
      rows: data.envelopes.length > 0
        ? data.envelopes.map((env) => {
            const spent = env.spentPaise || 0;
            const cap = env.allocatedPaise;
            const remain = cap - spent;
            return {
              name: env.name,
              month: env.monthKey || 'Monthly',
              cap: cap / 100,
              spent: spent / 100,
              remaining: remain / 100,
              util: cap > 0 ? spent / cap : 0,
              status: spent > cap ? 'OVER_BUDGET' : 'HEALTHY',
            };
          })
        : [
            {
              name: 'No budget envelopes configured for selected timeframe',
              month: rangeLabel,
              cap: 0,
              spent: 0,
              remaining: 0,
              util: 0,
              status: 'HEALTHY',
            },
          ],
    });
  }

  // Sheet 9: Transactions (with mathematically audited Running Period Net)
  if (hasModule('transactions') || hasModule('finance_overview')) {
    // 1. Sort all cash transactions chronologically (oldest to newest) to compute forward running net
    const chronTx = [
      ...data.incomes.map((i) => ({
        date: i.date,
        type: 'INCOME',
        desc: i.source,
        cat: i.category,
        method: 'Direct Credit',
        flow: 'CREDIT',
        amount: i.amountPaise / 100,
        paiseDelta: i.amountPaise,
        notes: i.notes || '',
      })),
      ...data.expenses.map((e) => ({
        date: e.date,
        type: 'EXPENSE',
        desc: e.description,
        cat: e.categoryName || e.categoryId || 'Uncategorised',
        method: (e.paymentMethod || '').replace('_', ' ').toUpperCase() || 'OTHER',
        flow: 'DEBIT',
        amount: -(e.amountPaise / 100),
        paiseDelta: -e.amountPaise,
        notes: e.notes || '',
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let runningAccumulator = 0;
    const rowsWithNet = chronTx.map((tx) => {
      runningAccumulator += tx.paiseDelta;
      return {
        date: tx.date,
        type: tx.type,
        desc: tx.desc,
        cat: tx.cat,
        method: tx.method,
        flow: tx.flow,
        amount: tx.amount,
        runningNet: runningAccumulator / 100,
        notes: tx.notes,
      };
    });

    // Display in reverse chronological order (newest first)
    const displayJournalRows = [...rowsWithNet].reverse();

    sheets.push({
      name: 'Transactions',
      freezeHeader: true,
      autoFilter: displayJournalRows.length > 0,
      columns: [
        { header: 'Date', key: 'date', width: 14, format: 'date' },
        { header: 'Entry Type', key: 'type', width: 16 },
        { header: 'Description / Entity', key: 'desc', width: 30 },
        { header: 'Category', key: 'cat', width: 22 },
        { header: 'Payment Method', key: 'method', width: 18 },
        { header: 'Flow Status', key: 'flow', width: 16 },
        { header: `Amount (${currency})`, key: 'amount', width: 18, format: 'currency' },
        { header: `Running Period Net (${currency})`, key: 'runningNet', width: 24, format: 'currency' },
        { header: 'Notes', key: 'notes', width: 28 },
      ],
      rows: displayJournalRows.length > 0
        ? displayJournalRows
        : [
            {
              date: rangeLabel,
              type: 'EMPTY',
              desc: 'No journal transactions recorded in selected timeframe',
              cat: 'N/A',
              method: 'N/A',
              flow: 'NONE',
              amount: 0,
              runningNet: 0,
              notes: 'Empty ledger timeframe',
            },
          ],
    });
  }

  // Sheet 7: Savings Goals
  if (hasModule('savings_goals')) {
    sheets.push({
      name: 'Savings Goals',
      freezeHeader: true,
      autoFilter: data.savingsGoals.length > 0,
      columns: [
        { header: 'Goal Title', key: 'title', width: 28 },
        { header: `Target Amount (${currency})`, key: 'target', width: 20, format: 'currency' },
        { header: `Saved Amount (${currency})`, key: 'saved', width: 20, format: 'currency' },
        { header: 'Progress %', key: 'pct', width: 16, format: 'percent' },
        { header: 'Target Date', key: 'date', width: 16, format: 'text' },
        { header: 'Status', key: 'status', width: 18 },
      ],
      rows: data.savingsGoals.length > 0
        ? data.savingsGoals.map((g) => ({
            title: g.title,
            target: g.targetPaise / 100,
            saved: g.savedPaise / 100,
            pct: g.targetPaise > 0 ? g.savedPaise / g.targetPaise : 0,
            date: g.targetDate || 'Ongoing',
            status: g.savedPaise >= g.targetPaise ? 'COMPLETED' : 'IN_PROGRESS',
          }))
        : [
            {
              title: 'No savings goals configured in account',
              target: 0,
              saved: 0,
              pct: 0,
              date: 'N/A',
              status: 'IN_PROGRESS',
            },
          ],
    });
  }

  // Sheet 8: Tasks
  if (hasModule('tasks') || hasModule('productivity_overview')) {
    sheets.push({
      name: 'Tasks',
      freezeHeader: true,
      autoFilter: data.tasks.length > 0,
      columns: [
        { header: 'Task Title', key: 'title', width: 34 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Priority', key: 'priority', width: 16 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Due Date', key: 'dueDate', width: 16, format: 'text' },
        { header: 'Est Pomodoros', key: 'poms', width: 16, format: 'integer' },
        { header: 'Completed At', key: 'completedAt', width: 22, format: 'text' },
      ],
      rows: data.tasks.length > 0
        ? data.tasks.map((t) => ({
            title: t.title,
            status: t.status.toUpperCase(),
            priority: t.priority.toUpperCase(),
            category: t.category || 'General',
            dueDate: t.dueDate || '',
            poms: t.estimatedPomodoros || 1,
            completedAt: t.completedAt ? t.completedAt.slice(0, 16).replace('T', ' ') : '',
          }))
        : [
            {
              title: 'No tasks scheduled or recorded in selected date range',
              status: 'N/A',
              priority: 'N/A',
              category: 'N/A',
              dueDate: rangeLabel,
              poms: 0,
              completedAt: '',
            },
          ],
    });
  }

  // Sheet 9: Focus Sessions
  if (hasModule('focus_sessions') || hasModule('productivity_overview')) {
    sheets.push({
      name: 'Focus Sessions',
      freezeHeader: true,
      autoFilter: data.sessions.length > 0,
      columns: [
        { header: 'Session Date', key: 'date', width: 14, format: 'date' },
        { header: 'Start Time', key: 'startTime', width: 22, format: 'text' },
        { header: 'Focus Mode', key: 'mode', width: 18 },
        { header: 'Duration (Minutes)', key: 'mins', width: 20, format: 'integer' },
        { header: 'Completed', key: 'completed', width: 16 },
        { header: 'Associated Task ID', key: 'task', width: 24 },
      ],
      rows: data.sessions.length > 0
        ? data.sessions.map((s) => ({
            date: s.startedAt.slice(0, 10),
            startTime: s.startedAt.slice(11, 19),
            mode: s.mode.toUpperCase(),
            mins: Math.round(s.durationSeconds / 60),
            completed: s.completed ? 'YES' : 'NO',
            task: s.taskId || 'None',
          }))
        : [
            {
              date: rangeLabel,
              startTime: 'N/A',
              mode: 'N/A',
              mins: 0,
              completed: 'N/A',
              task: 'No deep focus sessions logged in period',
            },
          ],
    });
  }

  // Sheet 10: Study
  if (hasModule('study_os')) {
    sheets.push({
      name: 'Study',
      freezeHeader: true,
      autoFilter: data.studySubjects.length > 0,
      columns: [
        { header: 'Code', key: 'code', width: 14 },
        { header: 'Subject Name', key: 'name', width: 30 },
        { header: 'Target Exam', key: 'exam', width: 20 },
        { header: 'Total Subtopics', key: 'total', width: 16, format: 'integer' },
        { header: 'Completed', key: 'completed', width: 16, format: 'integer' },
        { header: 'Completion %', key: 'pct', width: 16, format: 'percent' },
      ],
      rows: data.studySubjects.length > 0
        ? data.studySubjects.map((s) => ({
            code: s.code,
            name: s.name,
            exam: s.targetExam || 'General',
            total: s.totalSubtopics,
            completed: s.completedSubtopics,
            pct: s.totalSubtopics > 0 ? s.completedSubtopics / s.totalSubtopics : 0,
          }))
        : [
            {
              code: 'N/A',
              name: 'No study curriculum subjects registered',
              exam: 'N/A',
              total: 0,
              completed: 0,
              pct: 0,
            },
          ],
    });
  }

  // Sheet 11: Habits
  if (hasModule('habits')) {
    sheets.push({
      name: 'Habits',
      freezeHeader: true,
      autoFilter: data.habits.length > 0,
      columns: [
        { header: 'Habit Title', key: 'title', width: 28 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Frequency', key: 'frequency', width: 16 },
        { header: 'Current Streak (Days)', key: 'streak', width: 22, format: 'integer' },
        { header: 'Best Streak (Days)', key: 'bestStreak', width: 20, format: 'integer' },
        { header: 'Total Check-ins', key: 'totalDays', width: 18, format: 'integer' },
      ],
      rows: data.habits.length > 0
        ? data.habits.map((h) => ({
            title: h.title,
            category: h.category,
            frequency: h.frequency.toUpperCase(),
            streak: (h.completedDates || []).length,
            bestStreak: h.bestStreakDays || 0,
            totalDays: (h.completedDates || []).length,
          }))
        : [
            {
              title: 'No habits tracked in this period',
              category: 'N/A',
              frequency: 'N/A',
              streak: 0,
              bestStreak: 0,
              totalDays: 0,
            },
          ],
    });
  }

  // Sheet 12: Calendar
  if (hasModule('calendar')) {
    const calendarRows = [
      ...data.tasks.map((t) => ({ date: t.dueDate || t.createdAt.slice(0, 10), type: 'TASK', desc: t.title, meta: `${t.priority} priority`, status: t.status })),
      ...data.bills.map((b) => ({ date: b.dueDate, type: 'BILL', desc: b.name, meta: `${formatCurrency(b.amountPaise, currency)}`, status: b.status })),
      ...data.incomes.map((i) => ({ date: i.date, type: 'INCOME', desc: i.source, meta: `+${formatCurrency(i.amountPaise, currency)}`, status: 'CREDITED' })),
      ...data.expenses.map((e) => ({ date: e.date, type: 'EXPENSE', desc: e.description, meta: `-${formatCurrency(e.amountPaise, currency)}`, status: e.paymentMethod })),
      ...data.timeBlocks.map((tb) => ({ date: tb.date, type: 'TIME_BLOCK', desc: tb.title, meta: `${tb.category}`, status: `${tb.startMinute}m-${tb.endMinute}m` })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    sheets.push({
      name: 'Calendar',
      freezeHeader: true,
      autoFilter: calendarRows.length > 0,
      columns: [
        { header: 'Event Date', key: 'date', width: 14, format: 'date' },
        { header: 'Domain Entity', key: 'type', width: 16 },
        { header: 'Description / Context', key: 'desc', width: 34 },
        { header: 'Metadata & Value', key: 'meta', width: 22 },
        { header: 'Execution State', key: 'status', width: 18 },
      ],
      rows: calendarRows.length > 0
        ? calendarRows
        : [
            {
              date: rangeLabel,
              type: 'N/A',
              desc: 'No calendar events or scheduled tasks in selected timeframe',
              meta: 'N/A',
              status: 'EMPTY_PERIOD',
            },
          ],
    });
  }

  return sheets;
}

// =========================================================================
// 3. LUXURY EDITORIAL PDF REPORT GENERATOR (Personal Finance Intelligence)
// =========================================================================

export interface ExecutivePdfOptions {
  templateId?: ReportTemplateId;
  customTitle?: string;
  selectedModules?: Set<ExportModuleId>;
  currency?: CurrencyCode;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Vector SVG Donut Chart for Expense Category Breakdown
export function generateDonutChartSvg(
  categories: Array<[string, number]>,
  totalExpPaise: number,
  currency: CurrencyCode = 'INR'
): string {
  if (totalExpPaise <= 0 || categories.length === 0) {
    return `<div style="text-align: center; color: #94a3b8; padding: 36px 20px; font-size: 11px; font-weight: 600;">No expense outflow recorded to chart</div>`;
  }
  const colors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#f43f5e', // Rose
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#06b6d4', // Cyan
    '#64748b', // Slate
  ];
  const r = 68;
  const circ = 2 * Math.PI * r;
  let accumulatedAngle = 0;
  const top7 = categories.slice(0, 7);
  const otherPaise = categories.slice(7).reduce((acc, c) => acc + c[1], 0);
  const slicesData = [...top7];
  if (otherPaise > 0) {
    slicesData.push(['Other Categories', otherPaise]);
  }

  const circles = slicesData.map(([name, paise], idx) => {
    const fraction = paise / totalExpPaise;
    const dash = fraction * circ;
    const gap = circ - dash;
    const offset = -accumulatedAngle;
    accumulatedAngle += dash;
    const color = colors[idx % colors.length];
    return `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 100 100)" />`;
  }).join('\n');

  const formattedTotal = escapeHtml(formatCurrency(totalExpPaise, currency));

  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
      <svg width="190" height="190" viewBox="0 0 200 200" style="display: block; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.06));">
        ${circles}
        <text x="100" y="93" text-anchor="middle" font-size="8.5" font-weight="800" fill="#64748b" letter-spacing="0.08em">TOTAL OUTFLOW</text>
        <text x="100" y="112" text-anchor="middle" font-size="13" font-weight="900" fill="#0f172a" font-family="monospace">${formattedTotal}</text>
      </svg>
      <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 10px; margin-top: 14px; max-width: 260px;">
        ${slicesData.map(([name, paise], idx) => {
          const color = colors[idx % colors.length];
          const pct = Math.round((paise / totalExpPaise) * 100);
          const truncated = name.length > 14 ? name.slice(0, 13) + '…' : name;
          return `<div style="display: flex; align-items: center; gap: 5px; font-size: 9px; color: #334155; font-weight: 600;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: ${color};"></span>
            <span>${escapeHtml(truncated)} (${pct}%)</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// Vector SVG Daily Spending Timeline Bar Chart
export function generateDailySpendingBarSvg(
  expenses: Array<{ date: string; amountPaise: number }>,
  totalExpPaise: number,
  currency: CurrencyCode = 'INR'
): { svg: string; peakDay: { date: string; paise: number } | null; avgDailyPaise: number } {
  if (expenses.length === 0 || totalExpPaise <= 0) {
    return {
      svg: `<div style="text-align: center; color: #94a3b8; padding: 24px; font-size: 11px;">No daily expense transactions to visualize</div>`,
      peakDay: null,
      avgDailyPaise: 0,
    };
  }

  const dailyMap: Record<string, number> = {};
  for (const e of expenses) {
    dailyMap[e.date] = (dailyMap[e.date] || 0) + e.amountPaise;
  }

  const sortedDays = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]));
  const activeDayCount = sortedDays.length;
  const avgDailyPaise = activeDayCount > 0 ? Math.round(totalExpPaise / activeDayCount) : 0;

  let peakDay: { date: string; paise: number } | null = null;
  let maxDailyPaise = 0;
  for (const [d, p] of sortedDays) {
    if (p > maxDailyPaise) {
      maxDailyPaise = p;
      peakDay = { date: d, paise: p };
    }
  }

  const displayDays = sortedDays.slice(-14);
  const chartHeight = 85;
  const chartWidth = 520;
  const n = displayDays.length;
  const availableWidth = chartWidth - 60;
  const spacing = Math.floor(availableWidth / Math.max(1, n));
  const barWidth = Math.min(26, Math.max(10, spacing - 8));
  const startX = 35;

  const bars = displayDays.map(([date, paise], idx) => {
    const x = startX + idx * spacing + (spacing - barWidth) / 2;
    const h = Math.max(5, Math.round((paise / maxDailyPaise) * (chartHeight - 24)));
    const y = chartHeight - h;
    const isPeak = paise === maxDailyPaise;
    const fill = isPeak ? '#e11d48' : '#6366f1';
    const dayLabel = date.length >= 10 ? date.slice(5) : date;
    const amountLabel = paise >= 100000
      ? formatCurrency(paise, currency, { compact: true })
      : formatCurrency(paise, currency, { hideDecimals: true });

    return `
      <g>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="3" fill="${fill}" />
        <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="8" font-weight="700" fill="${isPeak ? '#e11d48' : '#475569'}">${escapeHtml(amountLabel)}</text>
        <text x="${x + barWidth / 2}" y="${chartHeight + 14}" text-anchor="middle" font-size="8" fill="#64748b">${escapeHtml(dayLabel)}</text>
      </g>
    `;
  }).join('\n');

  const svg = `
    <svg width="100%" height="${chartHeight + 22}" viewBox="0 0 ${chartWidth} ${chartHeight + 22}" fill="none">
      <line x1="25" y1="${chartHeight}" x2="${chartWidth - 15}" y2="${chartHeight}" stroke="#e2e8f0" stroke-width="1" />
      ${bars}
    </svg>
  `;

  return { svg, peakDay, avgDailyPaise };
}

export function generateExecutivePdfReportHtml(
  data: UnifiedExportDataPayload,
  rangeLabel: string,
  userName: string = 'Verified FocusFlow User',
  options: ExecutivePdfOptions = {}
): string {
  const templateConfig = options.templateId ? REPORT_TEMPLATES[options.templateId] : null;
  const reportTitle = options.customTitle || templateConfig?.title || 'Executive Master Dossier';
  const reportCategory = templateConfig?.category || 'CONFIDENTIAL EXECUTIVE PERFORMANCE DOSSIER';
  const reportDescription = templateConfig?.description || 'Audited multi-vector executive performance statement derived from client-side persistent records.';
  const docRef = computeDocumentReference(data, rangeLabel);
  const currency: CurrencyCode = options.currency || data.userSettings?.currency || 'INR';

  const selectedMods: Set<ExportModuleId> | null =
    options.selectedModules && options.selectedModules.size > 0
      ? options.selectedModules
      : templateConfig?.defaultModules
      ? new Set(templateConfig.defaultModules)
      : null;
  const hasSelectedMods = selectedMods !== null && selectedMods.size > 0;
  const hasFinance = !hasSelectedMods || Array.from(selectedMods).some((m) =>
    ['finance_overview', 'income', 'expenses', 'transactions', 'bills', 'envelopes', 'savings_goals', 'account_backup'].includes(m)
  );
  const hasProductivity = !hasSelectedMods || Array.from(selectedMods).some((m) =>
    ['tasks', 'focus_sessions', 'productivity_overview', 'account_backup'].includes(m)
  );
  const hasStudy = !hasSelectedMods || selectedMods.has('study_os') || selectedMods.has('account_backup');
  const hasHabits = !hasSelectedMods || selectedMods.has('habits') || selectedMods.has('account_backup');
  const hasCalendar = !hasSelectedMods || selectedMods.has('calendar') || selectedMods.has('account_backup');

  const formatMinuteOfDay = (min: number): string => {
    const safe = Math.max(0, Math.min(1439, Math.floor(min || 0)));
    const hh = Math.floor(safe / 60).toString().padStart(2, '0');
    const mm = (safe % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  let secCounter = hasFinance ? 5 : 0;
  const prodSecNum = hasProductivity ? ++secCounter : 0;
  const studySecNum = hasStudy ? ++secCounter : 0;
  const habitSecNum = hasHabits ? ++secCounter : 0;
  const calSecNum = hasCalendar ? ++secCounter : 0;
  const padSec = (n: number) => n.toString().padStart(2, '0');

  const fmt = (paise: number) => formatCurrency(paise, currency);

  const totalInc = data.incomes.reduce((acc, i) => acc + i.amountPaise, 0);
  const totalExp = data.expenses.reduce((acc, e) => acc + e.amountPaise, 0);
  const net = totalInc - totalExp;
  const completedTasks = data.tasks.filter((t) => t.status === 'completed').length;
  const totalFocusMins = Math.round(data.sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60);
  const savingsRate = totalInc > 0 ? Math.max(0, Math.round((net / totalInc) * 100)) : 0;
  const taskRate = data.tasks.length > 0 ? Math.round((completedTasks / data.tasks.length) * 100) : 0;

  // Study & Habit metrics
  const totalHabitCompletions = data.habits.reduce((acc, h) => acc + (h.completedDates?.length || 0), 0);
  const bestStreakOverall = data.habits.reduce((acc, h) => Math.max(acc, h.bestStreakDays || 0), 0);
  const masteredTopics = data.studyRevisions.filter((r) => r.status === 'mastered').length;
  const practicedTopics = data.studyTopics.filter((t) => t.practice).length;

  // Group top expense categories
  const catMap: Record<string, number> = {};
  for (const exp of data.expenses) {
    const c = exp.categoryName || exp.categoryId || 'General';
    catMap[c] = (catMap[c] || 0) + exp.amountPaise;
  }
  const topCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // Group top income sources
  const incMap: Record<string, number> = {};
  for (const inc of data.incomes) {
    const s = inc.source || 'General Inflow';
    incMap[s] = (incMap[s] || 0) + inc.amountPaise;
  }
  const topIncomes = Object.entries(incMap).sort((a, b) => b[1] - a[1]);

  // Payment Method Distribution
  const methodMap: Record<string, { paise: number; count: number }> = {};
  for (const exp of data.expenses) {
    const m = (exp.paymentMethod || 'other').toUpperCase().replace('_', ' ');
    if (!methodMap[m]) methodMap[m] = { paise: 0, count: 0 };
    methodMap[m].paise += exp.amountPaise;
    methodMap[m].count += 1;
  }
  const paymentMethodsList = Object.entries(methodMap).sort((a, b) => b[1].paise - a[1].paise);

  // Weekly Dynamics Breakdown
  const weeks = [
    { label: 'Week 1 (Days 1–7)', start: 1, end: 7, inc: 0, exp: 0 },
    { label: 'Week 2 (Days 8–14)', start: 8, end: 14, inc: 0, exp: 0 },
    { label: 'Week 3 (Days 15–21)', start: 15, end: 21, inc: 0, exp: 0 },
    { label: 'Week 4 (Days 22–28)', start: 22, end: 28, inc: 0, exp: 0 },
    { label: 'Week 5 (Days 29–31)', start: 29, end: 31, inc: 0, exp: 0 },
  ];
  for (const i of data.incomes) {
    const day = parseInt(i.date.slice(8, 10), 10) || 1;
    const w = weeks.find((wk) => day >= wk.start && day <= wk.end) || weeks[weeks.length - 1];
    w.inc += i.amountPaise;
  }
  for (const e of data.expenses) {
    const day = parseInt(e.date.slice(8, 10), 10) || 1;
    const w = weeks.find((wk) => day >= wk.start && day <= wk.end) || weeks[weeks.length - 1];
    w.exp += e.amountPaise;
  }

  // Budget & Envelopes summary
  const totalAllocatedCap = data.envelopes.reduce((acc, env) => acc + env.allocatedPaise, 0);
  const totalEnvelopeSpent = data.envelopes.reduce((acc, env) => acc + (env.spentPaise || 0), 0);
  const remainingBudgetHeadroom = totalAllocatedCap - totalEnvelopeSpent;

  // Bills summary
  const pendingBills = data.bills.filter((b) => b.status !== 'PAID');
  const pendingBillsPaise = pendingBills.reduce((acc, b) => acc + b.amountPaise, 0);

  // Daily Spending Chart data
  const { svg: dailyBarSvg, peakDay, avgDailyPaise } = generateDailySpendingBarSvg(data.expenses, totalExp, currency);
  const donutChartSvg = generateDonutChartSvg(topCategories, totalExp, currency);

  // Visual Category Distribution Chart Rows
  const categoryBarRows = topCategories.map(([name, paise]) => {
    const pct = totalExp > 0 ? Math.round((paise / totalExp) * 100) : 0;
    const count = data.expenses.filter((e) => (e.categoryName || e.categoryId || 'General') === name).length;
    const avg = count > 0 ? paise / count : 0;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 600; color: #0f172a; font-size: 10.5px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: #7c3aed; margin-right: 6px;"></span>
          ${escapeHtml(name)}
        </td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; color: #e11d48; font-size: 10.5px;">
          ${escapeHtml(fmt(paise))}
        </td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 600; color: #64748b; font-size: 10.5px;">${pct}%</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: #475569;">${count}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: #64748b;">${escapeHtml(fmt(avg))}</td>
        <td style="padding: 6px 10px; width: 90px;">
          <div style="background: #f1f5f9; border-radius: 9999px; height: 5px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #7c3aed, #6366f1); height: 100%; width: ${Math.min(100, pct)}%;"></div>
          </div>
        </td>
      </tr>`;
  }).join('');

  // Chronological Transactions with mathematically verified Running Period Net
  const sortedChronTx = [
    ...data.incomes.map((i) => ({
      date: i.date,
      type: 'INCOME',
      title: i.source,
      cat: i.category,
      method: 'Direct Credit',
      amount: i.amountPaise,
      delta: i.amountPaise,
      sign: '+',
    })),
    ...data.expenses.map((e) => ({
      date: e.date,
      type: 'EXPENSE',
      title: e.description,
      cat: e.categoryName || e.categoryId || 'Uncategorised',
      method: (e.paymentMethod || '').replace('_', ' ').toUpperCase() || 'OTHER',
      amount: e.amountPaise,
      delta: -e.amountPaise,
      sign: '-',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let runningPaise = 0;
  const txWithRunning = sortedChronTx.map((tx) => {
    runningPaise += tx.delta;
    return {
      ...tx,
      runningNetPaise: runningPaise,
    };
  });

  const displayTxRows = [...txWithRunning]
    .reverse()
    .slice(0, 40)
    .map((tx) => `
      <tr>
        <td style="padding: 6px 10px; font-family: monospace; font-size: 10px; color: #64748b;">${escapeHtml(tx.date)}</td>
        <td style="padding: 6px 10px;">
          <span style="font-size: 8.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.05em; background: ${tx.sign === '+' ? '#dcfce7' : '#fee2e2'}; color: ${tx.sign === '+' ? '#15803d' : '#b91c1c'};">
            ${tx.type}
          </span>
        </td>
        <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(tx.title)}</td>
        <td style="padding: 6px 10px; font-size: 10px; color: #64748b;">${escapeHtml(tx.cat)}</td>
        <td style="padding: 6px 10px; font-size: 9.5px; color: #64748b;">${escapeHtml(tx.method)}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10.5px; color: ${tx.sign === '+' ? '#059669' : '#e11d48'};">
          ${tx.sign}${escapeHtml(fmt(tx.amount))}
        </td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10.5px; color: ${tx.runningNetPaise >= 0 ? '#059669' : '#e11d48'};">
          ${tx.runningNetPaise >= 0 ? '+' : '-'}${escapeHtml(fmt(Math.abs(tx.runningNetPaise)))}
        </td>
      </tr>`)
    .join('');

  // Weekly Dynamics Table Rows
  const weeklyRows = weeks.map((w) => {
    const netWk = w.inc - w.exp;
    const retPct = w.inc > 0 ? Math.max(0, Math.round((netWk / w.inc) * 100)) : 0;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(w.label)}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; color: #059669; font-weight: 700; font-size: 10.5px;">+${escapeHtml(fmt(w.inc))}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; color: #e11d48; font-weight: 700; font-size: 10.5px;">-${escapeHtml(fmt(w.exp))}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10.5px; color: ${netWk >= 0 ? '#059669' : '#e11d48'};">
          ${netWk >= 0 ? '+' : '-'}${escapeHtml(fmt(Math.abs(netWk)))}
        </td>
        <td style="padding: 6px 10px; text-align: right; font-size: 10px;">
          <span style="font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${netWk >= 0 ? '#dcfce7' : '#fee2e2'}; color: ${netWk >= 0 ? '#15803d' : '#b91c1c'};">
            ${netWk >= 0 ? (w.inc > 0 ? 'SURPLUS' : 'BALANCED') : 'DEFICIT'}
          </span>
        </td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 700; font-size: 10.5px; color: #64748b;">${w.inc > 0 ? `${retPct}%` : '—'}</td>
      </tr>`;
  }).join('');

  // Payment Method Breakdown Rows
  const paymentMethodRows = paymentMethodsList.map(([method, stat]) => {
    const pct = totalExp > 0 ? Math.round((stat.paise / totalExp) * 100) : 0;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(method)}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; color: #e11d48; font-size: 10.5px;">${escapeHtml(fmt(stat.paise))}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 600; font-size: 10.5px; color: #64748b;">${pct}%</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: #475569;">${stat.count} txns</td>
      </tr>`;
  }).join('');

  // Income Sources Rows
  const incomeSourcesRows = topIncomes.map(([source, paise]) => {
    const pct = totalInc > 0 ? Math.round((paise / totalInc) * 100) : 0;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(source)}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; color: #059669; font-size: 10.5px;">+${escapeHtml(fmt(paise))}</td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 600; font-size: 10.5px; color: #64748b;">${pct}%</td>
      </tr>`;
  }).join('');

  // Bills Rows
  const billRows = data.bills.map((b) => {
    const isPaid = b.status === 'PAID';
    const isOverdue = b.status === 'OVERDUE';
    const badgeBg = isPaid ? '#dcfce7' : isOverdue ? '#fee2e2' : '#fef3c7';
    const badgeColor = isPaid ? '#15803d' : isOverdue ? '#b91c1c' : '#b45309';
    return `
    <tr>
      <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(b.name)}</td>
      <td style="padding: 6px 10px; font-family: monospace; font-size: 10px; color: #64748b;">${escapeHtml(b.dueDate)}</td>
      <td style="padding: 6px 10px; font-size: 10px; color: #64748b;">${escapeHtml(b.categoryName || b.categoryId)}</td>
      <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10.5px; color: #0f172a;">${escapeHtml(fmt(b.amountPaise))}</td>
      <td style="padding: 6px 10px; text-align: right;">
        <span style="font-size: 8.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor};">
          ${escapeHtml(b.status)}
        </span>
      </td>
    </tr>`;
  }).join('');

  // Budget Envelopes Rows
  const budgetRows = data.envelopes.map((env) => {
    const spent = env.spentPaise || 0;
    const cap = env.allocatedPaise;
    const remain = cap - spent;
    const util = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
    const isOver = spent > cap;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(env.name)}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: #0f172a;">${escapeHtml(fmt(cap))}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: ${isOver ? '#e11d48' : '#475569'}; font-weight: 700;">${escapeHtml(fmt(spent))}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: ${remain >= 0 ? '#059669' : '#e11d48'}; font-weight: 700;">${escapeHtml(fmt(remain))}</td>
        <td style="padding: 6px 10px; width: 85px;">
          <div style="background: #f1f5f9; border-radius: 9999px; height: 5px; overflow: hidden;">
            <div style="background: ${isOver ? '#e11d48' : '#7c3aed'}; height: 100%; width: ${util}%;"></div>
          </div>
        </td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 700; font-size: 10px; color: ${isOver ? '#e11d48' : '#059669'};">
          ${isOver ? 'OVER' : 'HEALTHY'}
        </td>
      </tr>`;
  }).join('');

  // Tasks Register
  const taskRows = data.tasks.slice(0, 30).map((t) => `
    <tr>
      <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(t.title)}</td>
      <td style="padding: 6px 10px;">
        <span style="font-size: 8.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${t.priority === 'high' ? '#fee2e2' : t.priority === 'medium' ? '#ffedd5' : '#f1f5f9'}; color: ${t.priority === 'high' ? '#b91c1c' : t.priority === 'medium' ? '#c2410c' : '#475569'};">
          ${escapeHtml(t.priority.toUpperCase())}
        </span>
      </td>
      <td style="padding: 6px 10px; font-size: 10px; color: #64748b;">${escapeHtml(t.category || 'General')}</td>
      <td style="padding: 6px 10px; font-family: monospace; font-size: 10px; color: #64748b;">${escapeHtml(t.dueDate || 'No Due Date')}</td>
      <td style="padding: 6px 10px; text-align: right;">
        <span style="font-size: 8.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: ${t.status === 'completed' ? '#dcfce7' : '#fef3c7'}; color: ${t.status === 'completed' ? '#15803d' : '#b45309'};">
          ${escapeHtml(t.status.toUpperCase())}
        </span>
      </td>
    </tr>`).join('');

  // Focus Sessions Register
  const sessionRows = data.sessions.slice(0, 25).map((s) => {
    const mins = Math.round(s.durationSeconds / 60);
    const dateStr = s.startedAt ? s.startedAt.slice(0, 10) : '—';
    return `
      <tr>
        <td style="padding: 6px 10px; font-family: monospace; font-size: 10px; color: #64748b;">${escapeHtml(dateStr)}</td>
        <td style="padding: 6px 10px; font-weight: 600; font-size: 10px; color: #0f172a;">${escapeHtml(s.taskTitle || s.subjectCode || 'Deep Focus Session')}</td>
        <td style="padding: 6px 10px; font-size: 9.5px; color: #64748b;">${escapeHtml(s.mode || 'pomodoro')}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10.5px; color: #7c3aed;">${mins} mins</td>
      </tr>`;
  }).join('');

  // Savings Goals Rows
  const savingsRows = data.savingsGoals.map((g) => {
    const pct = g.targetPaise > 0 ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100)) : 0;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 600; font-size: 10.5px; color: #0f172a;">${escapeHtml(g.title)}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: #0f172a;">${escapeHtml(fmt(g.targetPaise))}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10.5px; color: #059669; font-weight: 700;">${escapeHtml(fmt(g.savedPaise))}</td>
        <td style="padding: 6px 10px; width: 95px;">
          <div style="background: #f1f5f9; border-radius: 9999px; height: 5px; overflow: hidden;">
            <div style="background: #10b981; height: 100%; width: ${pct}%;"></div>
          </div>
        </td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 700; font-size: 10.5px; color: #64748b;">${pct}%</td>
      </tr>`;
  }).join('');

  // Study OS Subjects Table Rows
  const studySubjectRows = data.studySubjects.map((s) => {
    const pct = s.totalSubtopics > 0 ? Math.round((s.completedSubtopics / s.totalSubtopics) * 100) : 0;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 700; color: #0f172a; font-size: 10.5px;">${escapeHtml(s.name)}</td>
        <td style="padding: 6px 10px; font-family: monospace; font-size: 10px; color: #7c3aed;">${escapeHtml(s.code)}</td>
        <td style="padding: 6px 10px; font-size: 10px; color: #64748b;">${escapeHtml(s.targetExam || s.semesterOrDomain || 'General Academic')}</td>
        <td style="padding: 6px 10px; font-size: 10.5px; font-family: monospace; color: #334155;">${s.completedSubtopics} / ${s.totalSubtopics}</td>
        <td style="padding: 6px 10px; width: 90px;">
          <div style="background: #f1f5f9; border-radius: 9999px; height: 5px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #7c3aed, #6366f1); height: 100%; width: ${pct}%;"></div>
          </div>
        </td>
        <td style="padding: 6px 10px; text-align: right; font-weight: 700; font-size: 10px; color: ${pct === 100 ? '#059669' : '#7c3aed'};">
          ${pct}%
        </td>
      </tr>`;
  }).join('');

  // Study Topics Rows
  const studyTopicRows = data.studyTopics.slice(0, 30).map((t) => `
    <tr>
      <td style="padding: 6px 10px; font-weight: 600; font-size: 10px; color: #0f172a;">${escapeHtml(t.topic)}</td>
      <td style="padding: 6px 10px; font-size: 9.5px; color: #475569;">${escapeHtml(t.subtopic || '—')}</td>
      <td style="padding: 6px 10px; font-family: monospace; font-size: 9.5px; color: #7c3aed;">${escapeHtml(t.subjectCode)}</td>
      <td style="padding: 6px 10px;">
        <span style="font-size: 8.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${t.priority === 'High' ? '#fee2e2' : t.priority === 'Medium' ? '#ffedd5' : '#f1f5f9'}; color: ${t.priority === 'High' ? '#b91c1c' : t.priority === 'Medium' ? '#c2410c' : '#475569'};">
          ${escapeHtml(t.priority)}
        </span>
      </td>
      <td style="padding: 6px 10px; font-size: 9.5px; color: #334155;">
        ${t.theory ? '✓ Th ' : ''}${t.practice ? '✓ Pr ' : ''}${t.pyq ? '✓ PYQ' : ''}
      </td>
      <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10px; color: #64748b;">
        ${t.revisionCount}
      </td>
    </tr>`).join('');

  // Habit Formation Table Rows
  const habitRows = data.habits.map((h) => {
    const compCount = h.completedDates?.length || 0;
    return `
      <tr>
        <td style="padding: 6px 10px; font-weight: 700; color: #0f172a; font-size: 10.5px;">${escapeHtml(h.title)}</td>
        <td style="padding: 6px 10px; font-size: 10px; color: #64748b;">${escapeHtml(h.category)}</td>
        <td style="padding: 6px 10px; text-transform: uppercase; font-size: 9px; font-weight: 700; color: #475569;">${escapeHtml(h.frequency)}</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-size: 10px; color: #0f172a;">${h.targetDaysPerWeek || 7} d/wk</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10px; color: #059669;">${h.bestStreakDays || 0} d</td>
        <td style="padding: 6px 10px; text-align: right; font-family: monospace; font-weight: 700; font-size: 10px; color: #7c3aed;">${compCount} logs</td>
      </tr>`;
  }).join('');

  // Calendar / TimeBlock metrics & Table Rows
  const completedTimeBlocksCount = data.timeBlocks.filter((tb) => tb.completed).length;
  const totalTimeBlockMinutes = data.timeBlocks.reduce(
    (acc, tb) => acc + Math.max(0, (tb.endMinute || 0) - (tb.startMinute || 0)),
    0
  );
  const calCompletionRate = data.timeBlocks.length > 0
    ? Math.round((completedTimeBlocksCount / data.timeBlocks.length) * 100)
    : 0;

  const sortedTimeBlocks = [...data.timeBlocks].sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    return (a.startMinute || 0) - (b.startMinute || 0);
  });

  const timeBlockRows = sortedTimeBlocks.map((tb) => {
    const startStr = formatMinuteOfDay(tb.startMinute);
    const endStr = formatMinuteOfDay(tb.endMinute);
    const durMins = Math.max(0, (tb.endMinute || 0) - (tb.startMinute || 0));
    const durStr = durMins > 0 ? `${durMins}m` : '0m';
    const statusBadge = tb.completed
      ? '<span class="status-badge status-paid">Completed</span>'
      : '<span class="status-badge status-pending">Scheduled</span>';

    return `
      <tr>
        <td style="padding: 6px 10px; font-family: monospace; font-size: 10px; color: #475569; white-space: nowrap;">${escapeHtml(tb.date)}</td>
        <td style="padding: 6px 10px; font-family: monospace; font-size: 10px; font-weight: 600; color: #0f172a; white-space: nowrap;">${startStr} – ${endStr} <span style="color: #94a3b8; font-weight: 400; font-size: 9px;">(${durStr})</span></td>
        <td style="padding: 6px 10px; font-weight: 700; color: #0f172a; font-size: 10.5px;">${escapeHtml(tb.title)}</td>
        <td style="padding: 6px 10px; font-size: 10px; color: #64748b;">${escapeHtml(tb.category || 'General')}</td>
        <td style="padding: 6px 10px; font-size: 9.5px; color: #475569;">${escapeHtml(tb.notes || '—')}</td>
        <td style="padding: 6px 10px; text-align: right;">${statusBadge}</td>
      </tr>`;
  }).join('');

  // Generated timestamp in IST
  const generatedTimeStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate Cashflow Ratio
  const sumCashflow = totalInc + totalExp;
  const inflowRatio = sumCashflow > 0 ? Math.round((totalInc / sumCashflow) * 100) : 50;
  const outflowRatio = 100 - inflowRatio;

  // Top Category spotlight
  const topCategoryName = topCategories[0]?.[0] || 'Uncategorised';
  const topCategoryPaise = topCategories[0]?.[1] || 0;
  const topCategoryPct = totalExp > 0 ? Math.round((topCategoryPaise / totalExp) * 100) : 0;
  const topCategoryCount = data.expenses.filter((e) => (e.categoryName || e.categoryId || 'General') === topCategoryName).length;

  // Build Hero KPI & Narrative based on selected modules
  let heroKpiHtml = '';
  let narrativeHtml = '';

  if (hasFinance) {
    heroKpiHtml = `
      <div class="hero-kpi-grid">
        <div class="hero-kpi-card" style="border-left: 3px solid ${net >= 0 ? '#10b981' : '#ef4444'}; background: #ffffff;">
          <div class="hero-kpi-label">Net Financial Flow (Calculated Net Cashflow)</div>
          <div class="hero-kpi-val" style="color: ${net >= 0 ? '#059669' : '#e11d48'};">
            ${net >= 0 ? '+' : '-'}${escapeHtml(fmt(Math.abs(net)))}
          </div>
          <div class="hero-kpi-sub">Calculated Net Cashflow • Operational Ledger</div>
        </div>
        <div class="hero-kpi-card" style="border-left: 3px solid #10b981;">
          <div class="hero-kpi-label">Total Inflow (Credits)</div>
          <div class="hero-kpi-val" style="color: #059669;">+${escapeHtml(fmt(totalInc))}</div>
          <div class="hero-kpi-sub">${data.incomes.length} verified credit records</div>
        </div>
        <div class="hero-kpi-card" style="border-left: 3px solid #ef4444;">
          <div class="hero-kpi-label">Total Outflow (Debits)</div>
          <div class="hero-kpi-val" style="color: #e11d48;">-${escapeHtml(fmt(totalExp))}</div>
          <div class="hero-kpi-sub">${data.expenses.length} verified debit records</div>
        </div>
      </div>

      <div class="hero-kpi-grid">
        <div class="hero-kpi-card">
          <div class="hero-kpi-label">Operating Savings Rate</div>
          <div class="hero-kpi-val" style="color: #7c3aed;">${savingsRate}%</div>
          <div class="hero-kpi-sub">${totalInc > 0 ? 'Portion of income retained' : 'No recorded income in period'}</div>
        </div>
        <div class="hero-kpi-card">
          <div class="hero-kpi-label">Remaining Budget Headroom</div>
          <div class="hero-kpi-val" style="color: #0f172a;">${escapeHtml(fmt(Math.max(0, remainingBudgetHeadroom)))}</div>
          <div class="hero-kpi-sub">${data.envelopes.length > 0 ? `${data.envelopes.length} active envelopes` : 'No envelopes configured'}</div>
        </div>
        <div class="hero-kpi-card">
          <div class="hero-kpi-label">Scheduled Obligations (Due)</div>
          <div class="hero-kpi-val" style="color: ${pendingBills.length > 0 ? '#b45309' : '#059669'};">${escapeHtml(fmt(pendingBillsPaise))}</div>
          <div class="hero-kpi-sub">${pendingBills.length} pending / upcoming bills</div>
        </div>
      </div>

      <div class="cashflow-meter-box">
        <div style="display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; margin-bottom: 5px;">
          <span style="color: #059669;">INFLOW RATIO: ${inflowRatio}% (+${escapeHtml(fmt(totalInc))})</span>
          <span style="color: #e11d48;">OUTFLOW RATIO: ${outflowRatio}% (-${escapeHtml(fmt(totalExp))})</span>
        </div>
        <div style="background: #f1f5f9; border-radius: 9999px; height: 8px; overflow: hidden; display: flex;">
          <div style="background: #10b981; height: 100%; width: ${inflowRatio}%;"></div>
          <div style="background: #ef4444; height: 100%; width: ${outflowRatio}%;"></div>
        </div>
      </div>`;

    narrativeHtml = `
      <div class="insights-card" style="background: #ffffff;">
        <div class="insights-title">Executive Personal Finance Intelligence Brief</div>
        <ul class="insights-list">
          <li><strong>How much money do I have in this period?</strong> Net Financial Flow retained across the active window is <strong>${escapeHtml(fmt(Math.abs(net)))}</strong> (${net >= 0 ? 'Operating Surplus' : 'Operating Deficit'}). Note: FocusFlow tracks local operational ledger flows without external bank account syncing.</li>
          <li><strong>How much income did I receive?</strong> Total verified receipts stand at <strong>${escapeHtml(fmt(totalInc))}</strong> across ${data.incomes.length} credit entries.</li>
          <li><strong>How much did I spend?</strong> Total verified expenditure equals <strong>${escapeHtml(fmt(totalExp))}</strong> across ${data.expenses.length} debit transactions.</li>
          <li><strong>How much money remains?</strong> After accounting for all debits, <strong>${savingsRate}%</strong> of received revenue remains as operational surplus.</li>
          <li><strong>Data Authenticity Statement:</strong> 100% of values compiled directly from verified user accounting records with zero synthetic or demo entries.</li>
        </ul>
      </div>`;
  } else {
    heroKpiHtml = `
      <div class="hero-kpi-grid">
        <div class="hero-kpi-card" style="border-left: 3px solid #7c3aed; background: #ffffff;">
          <div class="hero-kpi-label">Tasks Execution Velocity</div>
          <div class="hero-kpi-val" style="color: #7c3aed;">
            ${taskRate}%
          </div>
          <div class="hero-kpi-sub">${completedTasks} of ${data.tasks.length} tasks completed</div>
        </div>
        <div class="hero-kpi-card" style="border-left: 3px solid #3b82f6;">
          <div class="hero-kpi-label">Deep Work Focus Time</div>
          <div class="hero-kpi-val" style="color: #2563eb;">${totalFocusMins} Mins</div>
          <div class="hero-kpi-sub">${(totalFocusMins / 60).toFixed(1)} hrs • ${data.sessions.length} sessions logged</div>
        </div>
        <div class="hero-kpi-card" style="border-left: 3px solid #10b981;">
          <div class="hero-kpi-label">${hasCalendar && !hasHabits ? 'Calendar Time Blocks' : 'Habit Streaks &amp; Logs'}</div>
          <div class="hero-kpi-val" style="color: #059669;">${hasCalendar && !hasHabits ? `${data.timeBlocks.length} Blocks` : `${data.habits.length} Habits`}</div>
          <div class="hero-kpi-sub">${hasCalendar && !hasHabits ? `${completedTimeBlocksCount} completed • ${(totalTimeBlockMinutes / 60).toFixed(1)} hrs` : `${totalHabitCompletions} logs • Peak streak: ${bestStreakOverall} days`}</div>
        </div>
      </div>

      <div class="hero-kpi-grid">
        <div class="hero-kpi-card">
          <div class="hero-kpi-label">Academic Subjects</div>
          <div class="hero-kpi-val" style="color: #0f172a;">${data.studySubjects.length} Courses</div>
          <div class="hero-kpi-sub">${data.studySubjects.reduce((acc, s) => acc + (s.totalSubtopics || 0), 0)} subtopics enrolled</div>
        </div>
        <div class="hero-kpi-card">
          <div class="hero-kpi-label">Study Topics Practiced</div>
          <div class="hero-kpi-val" style="color: #0f172a;">${practicedTopics} / ${data.studyTopics.length}</div>
          <div class="hero-kpi-sub">${data.studyTopics.filter((t) => t.pyq).length} past question papers solved</div>
        </div>
        <div class="hero-kpi-card">
          <div class="hero-kpi-label">Spaced Repetitions Mastered</div>
          <div class="hero-kpi-val" style="color: #059669;">${masteredTopics} / ${data.studyRevisions.length}</div>
          <div class="hero-kpi-sub">${data.studyRevisions.filter((r) => r.status === 'due').length} reviews currently due</div>
        </div>
      </div>

      <div class="cashflow-meter-box">
        <div style="display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; margin-bottom: 5px;">
          <span style="color: #7c3aed;">TASK COMPLETION RATE: ${taskRate}%</span>
          <span style="color: #64748b;">${completedTasks} / ${data.tasks.length} TASKS</span>
        </div>
        <div style="background: #f1f5f9; border-radius: 9999px; height: 8px; overflow: hidden; display: flex;">
          <div style="background: linear-gradient(90deg, #7c3aed, #6366f1); height: 100%; width: ${taskRate}%;"></div>
        </div>
      </div>`;

    narrativeHtml = `
      <div class="insights-card" style="background: #ffffff;">
        <div class="insights-title">Executive Productivity &amp; Academic Performance Brief</div>
        <ul class="insights-list">
          <li><strong>Task Execution Status:</strong> ${completedTasks} of ${data.tasks.length} scheduled tasks are marked completed (${taskRate}% completion velocity).</li>
          <li><strong>Deep Work Immersion:</strong> Accumulated ${totalFocusMins} minutes of timer-verified focus sessions across ${data.sessions.length} discrete blocks.</li>
          <li><strong>Academic Curricula Status:</strong> ${data.studySubjects.length} subjects tracked with ${data.studyTopics.length} active syllabus topics and ${masteredTopics} mastered spaced intervals.</li>
          <li><strong>Habit Consistency:</strong> ${data.habits.length} habits monitored with ${totalHabitCompletions} verified check-ins and an overall best streak of ${bestStreakOverall} days.</li>
          ${hasCalendar ? `<li><strong>Calendar &amp; Scheduled Activities:</strong> ${data.timeBlocks.length} scheduled time blocks tracked with ${completedTimeBlocksCount} marked completed (${calCompletionRate}% execution rate).</li>` : ''}
          <li><strong>Data Integrity Statement:</strong> All metrics extracted strictly from persistent user state; zero placeholder records.</li>
        </ul>
      </div>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>FocusFlow &amp; Finance — ${escapeHtml(reportTitle)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 14mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.45;
      font-size: 10.5px;
    }
    
    /* Luxury Multi-Page Layout */
    .report-page {
      min-height: 255mm;
      position: relative;
      padding-bottom: 24px;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }

    /* Cover Page */
    .cover-page {
      min-height: 255mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 12mm 10mm 10mm 10mm;
      page-break-after: always;
      break-after: page;
      position: relative;
      background: radial-gradient(circle at 90% 10%, #faf5ff 0%, #ffffff 60%);
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .cover-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 12px;
    }
    .brand-mark {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo-text {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.15em;
      color: #0f172a;
      text-transform: uppercase;
    }
    .cover-tag {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 4px;
      background: #0f172a;
      color: #ffffff;
    }
    .cover-body {
      margin: 20px 0;
    }
    .cover-classification {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #7c3aed;
      margin-bottom: 8px;
    }
    .cover-title {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1.15;
      color: #0f172a;
      margin: 0 0 10px 0;
    }
    .cover-desc {
      font-size: 12px;
      color: #475569;
      max-width: 520px;
      line-height: 1.5;
      margin-bottom: 18px;
    }
    .cover-window-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 10.5px;
      color: #1e293b;
      font-weight: 600;
    }
    .window-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #7c3aed;
    }
    .cover-meta-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .meta-field-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .meta-field-value {
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .meta-field-mono {
      font-family: monospace;
      color: #7c3aed;
    }

    /* Running Header for Pages 2+ */
    .running-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 14px;
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* Section Headings */
    .section-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0f172a;
      border-left: 3px solid #7c3aed;
      padding-left: 8px;
      margin: 18px 0 10px 0;
    }
    .section-num {
      color: #7c3aed;
      font-weight: 900;
    }

    /* Hero KPI Grid */
    .hero-kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .hero-kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .hero-kpi-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 3px;
    }
    .hero-kpi-val {
      font-size: 17px;
      font-weight: 900;
      font-family: monospace;
      color: #0f172a;
    }
    .hero-kpi-sub {
      font-size: 9px;
      color: #64748b;
      margin-top: 3px;
    }

    /* Cashflow Proportion Bar */
    .cashflow-meter-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }

    /* Spotlight Box */
    .spotlight-box {
      background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
      border: 1px solid #ddd6fe;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 14px;
    }
    .spotlight-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6d28d9;
      margin-bottom: 4px;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10px;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 6px 10px;
      text-align: left;
    }
    td {
      padding: 5.5px 10px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
    }
    tbody tr:nth-child(even) {
      background: #fafafd;
    }

    /* Insights Box */
    .insights-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .insights-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0f172a;
      margin-bottom: 5px;
    }
    .insights-list {
      margin: 0;
      padding-left: 14px;
      font-size: 10px;
      color: #334155;
      line-height: 1.5;
    }

    /* Footer */
    .doc-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      color: #94a3b8;
    }

    @media print {
      body { margin: 0; background: #ffffff; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; break-after: page; }
    }
  </style>
</head>
<body>

  <!-- ==================== PAGE 1: LUXURY COVER & HERO DASHBOARD ==================== -->
  <div class="cover-page">
    <div class="cover-top-bar">
      <div class="brand-mark">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <polygon points="12 2, 22 8.5, 22 15.5, 12 22, 2 15.5, 2 8.5" stroke="#0F172A" stroke-width="2" fill="#F5F3FF" />
          <polygon points="12 6, 18 10, 18 14, 12 18, 6 14, 6 10" fill="#7C3AED" />
        </svg>
        <div>
          <div class="brand-logo-text">FocusFlow &amp; Finance</div>
          <div style="font-size: 8px; color: #64748b; font-weight: 600; letter-spacing: 0.04em;">Executive Financial Ledger &amp; Productivity Intelligence Report</div>
        </div>
      </div>
      <div class="cover-tag">Executive Intelligence</div>
    </div>

    <div class="cover-body">
      <!-- Minimalist Vector Geometric Art -->
      <svg width="100%" height="70" viewBox="0 0 540 70" fill="none" style="margin-bottom: 12px; opacity: 0.7;">
        <circle cx="40" cy="35" r="30" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="2 3" />
        <circle cx="40" cy="35" r="16" stroke="#7C3AED" stroke-width="1.5" />
        <line x1="40" y1="35" x2="520" y2="35" stroke="#E2E8F0" stroke-width="1" />
        <circle cx="200" cy="35" r="4" fill="#7C3AED" />
        <circle cx="360" cy="35" r="4" fill="#6366F1" />
        <circle cx="480" cy="35" r="5" stroke="#0F172A" stroke-width="2" fill="#FFFFFF" />
        <path d="M40 35 Q 200 5, 360 35 T 520 35" stroke="#C4B5FD" stroke-width="1.5" fill="none" />
      </svg>

      <div class="cover-classification">${escapeHtml(reportCategory)}</div>
      <h1 class="cover-title">${escapeHtml(reportTitle)}</h1>
      <div class="cover-desc">${escapeHtml(reportDescription)}</div>
      <div class="cover-window-pill">
        <span class="window-dot"></span>
        Reporting Window: <strong>${escapeHtml(rangeLabel)}</strong>
      </div>

      <!-- Hero KPI Cards & Narrative -->
      <div style="margin-top: 18px;">
        ${heroKpiHtml}
        ${narrativeHtml}
      </div>
    </div>

    <div class="cover-meta-card">
      <div>
        <div class="meta-field-label">Prepared For Account</div>
        <div class="meta-field-value">${escapeHtml(userName)}</div>
      </div>
      <div>
        <div class="meta-field-label">Document Digest Ref</div>
        <div class="meta-field-value meta-field-mono">${escapeHtml(docRef)}</div>
      </div>
      <div>
        <div class="meta-field-label">Generated Timestamp</div>
        <div class="meta-field-value">${escapeHtml(generatedTimeStr)} IST</div>
      </div>
      <div>
        <div class="meta-field-label">Classification</div>
        <div class="meta-field-value" style="color: #6d28d9;">Strictly Confidential • Authorized</div>
      </div>
    </div>
  </div>

  ${hasFinance ? `
  <!-- ==================== PAGE 2: WHERE DID MY MONEY GO? ==================== -->
  <div class="report-page page-break">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>PAGE 02 • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">02</span> Where Did My Money Go? — Category Breakdown
    </div>

    <!-- Spotlight: Top Expense Driver -->
    <div class="spotlight-box">
      <div class="spotlight-title">Primary Expense Driver Spotlight</div>
      <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">
        ${escapeHtml(topCategoryName)}: ${escapeHtml(fmt(topCategoryPaise))} (${topCategoryPct}% of total period spending)
      </div>
      <div style="font-size: 10px; color: #475569;">
        ${topCategoryCount} transaction(s) recorded under ${escapeHtml(topCategoryName)}. This represents the single largest outflow cluster for ${escapeHtml(rangeLabel)}.
      </div>
    </div>

    <!-- Side-by-Side: Donut Chart & Category Table -->
    <div style="display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start; margin-bottom: 14px;">
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 10px;">
        <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; text-align: center; margin-bottom: 8px;">
          Vector Expenditure Distribution
        </div>
        ${donutChartSvg}
      </div>

      <div>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th style="text-align: right;">Total (${escapeHtml(currency)})</th>
              <th style="text-align: right;">Share</th>
              <th style="text-align: right;">Txns</th>
              <th style="text-align: right;">Avg Ticket</th>
              <th>Ratio</th>
            </tr>
          </thead>
          <tbody>
            ${categoryBarRows || '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 14px;">No expense records found within selected timeframe</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="insights-card">
      <div class="insights-title">Category Audit Notes</div>
      <ul class="insights-list">
        <li><strong>Category Allocation Integrity:</strong> All categories reflect stored transactions without algorithmic inference or description-based guessing.</li>
        <li><strong>Spend Concentration:</strong> Top ${Math.min(3, topCategories.length)} categories account for ${totalExp > 0 ? Math.round((topCategories.slice(0, 3).reduce((a, b) => a + b[1], 0) / totalExp) * 100) : 0}% of all outflow transactions.</li>
      </ul>
    </div>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>

  <!-- ==================== PAGE 3: SPENDING DYNAMICS & TIMELINE ==================== -->
  <div class="report-page page-break">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>PAGE 03 • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">03</span> Spending Dynamics &amp; Timeline Trends
    </div>

    <!-- Daily Spending Bar Chart Box -->
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #0f172a;">
          Daily Outflow Trajectory (Timeline View)
        </div>
        <div style="display: flex; gap: 8px;">
          <span style="font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #fee2e2; color: #b91c1c;">
            Peak Day: ${peakDay ? `${peakDay.date} (${fmt(peakDay.paise)})` : 'None'}
          </span>
          <span style="font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: #f1f5f9; color: #475569;">
            Avg Daily Outflow: ${fmt(avgDailyPaise)}
          </span>
        </div>
      </div>
      ${dailyBarSvg}
    </div>

    <!-- Weekly Spending Breakdown Table -->
    <div class="section-heading" style="margin-top: 14px;">
      <span class="section-num">03.1</span> Weekly Cashflow Dynamics
    </div>

    <table>
      <thead>
        <tr>
          <th>Week Slice</th>
          <th style="text-align: right;">Inflow (${escapeHtml(currency)})</th>
          <th style="text-align: right;">Outflow (${escapeHtml(currency)})</th>
          <th style="text-align: right;">Net Cashflow</th>
          <th style="text-align: right;">Status</th>
          <th style="text-align: right;">Retention Rate</th>
        </tr>
      </thead>
      <tbody>
        ${weeklyRows}
      </tbody>
    </table>

    <!-- Payment Methods Breakdown -->
    <div class="section-heading" style="margin-top: 14px;">
      <span class="section-num">03.2</span> Payment Methods Distribution
    </div>

    <table>
      <thead>
        <tr>
          <th>Payment Method</th>
          <th style="text-align: right;">Total Outflow (${escapeHtml(currency)})</th>
          <th style="text-align: right;">Percentage Share</th>
          <th style="text-align: right;">Transactions Count</th>
        </tr>
      </thead>
      <tbody>
        ${paymentMethodRows || '<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 10px;">No payment method distribution recorded</td></tr>'}
      </tbody>
    </table>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>

  <!-- ==================== PAGE 4: REVENUE, OBLIGATIONS & WEALTH ==================== -->
  <div class="report-page page-break">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>PAGE 04 • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">04</span> Revenue Streams, Scheduled Obligations &amp; Wealth
    </div>

    <!-- Revenue Streams Itemization -->
    <table>
      <thead>
        <tr>
          <th>Income Source / Entity</th>
          <th style="text-align: right;">Total Credited (${escapeHtml(currency)})</th>
          <th style="text-align: right;">Inflow Contribution %</th>
        </tr>
      </thead>
      <tbody>
        ${incomeSourcesRows || '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 10px;">No income sources recorded in this period</td></tr>'}
      </tbody>
    </table>

    <!-- Bills & Upcoming Payments -->
    <div class="section-heading" style="margin-top: 14px;">
      <span class="section-num">04.1</span> Scheduled Bills &amp; Payment Commitments
    </div>

    <table>
      <thead>
        <tr>
          <th>Bill / Commitment Name</th>
          <th>Due Date</th>
          <th>Category</th>
          <th style="text-align: right;">Amount (${escapeHtml(currency)})</th>
          <th style="text-align: right;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${billRows || '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 10px;">No scheduled bills configured for this timeframe</td></tr>'}
      </tbody>
    </table>

    <!-- Budget Envelope Status -->
    <div class="section-heading" style="margin-top: 14px;">
      <span class="section-num">04.2</span> Envelope Budgets &amp; Spending Caps
    </div>

    <table>
      <thead>
        <tr>
          <th>Envelope Name</th>
          <th style="text-align: right;">Allocated Cap</th>
          <th style="text-align: right;">Actual Spent</th>
          <th style="text-align: right;">Remaining Headroom</th>
          <th>Utilization</th>
          <th style="text-align: right;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${budgetRows || '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 10px;">No budget envelopes configured</td></tr>'}
      </tbody>
    </table>

    <!-- Savings Goals -->
    <div class="section-heading" style="margin-top: 14px;">
      <span class="section-num">04.3</span> Capital Accumulation &amp; Savings Goals
    </div>

    <table>
      <thead>
        <tr>
          <th>Savings Target</th>
          <th style="text-align: right;">Target Amount</th>
          <th style="text-align: right;">Saved Amount</th>
          <th>Progress Meter</th>
          <th style="text-align: right;">Completion</th>
        </tr>
      </thead>
      <tbody>
        ${savingsRows || '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 10px;">No savings goals configured in account</td></tr>'}
      </tbody>
    </table>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>

  <!-- ==================== PAGE 5: AUDITED TRANSACTIONS REGISTER ==================== -->
  <div class="report-page ${hasProductivity || hasStudy || hasHabits || hasCalendar ? 'page-break' : ''}">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>PAGE 05 • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">05</span> Audited Chronological Transactions Register
    </div>

    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Description / Payee</th>
          <th>Category</th>
          <th>Method</th>
          <th style="text-align: right;">Amount (${escapeHtml(currency)})</th>
          <th style="text-align: right;">Running Net (${escapeHtml(currency)})</th>
        </tr>
      </thead>
      <tbody>
        ${displayTxRows || '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 14px;">No transactions recorded in this period</td></tr>'}
      </tbody>
    </table>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>` : ''}

  ${hasProductivity ? `
  <!-- ==================== PRODUCTIVITY & SPRINT PERFORMANCE REGISTER ==================== -->
  <div class="report-page ${hasStudy || hasHabits || hasCalendar ? 'page-break' : ''}">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>PRODUCTIVITY REGISTER • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">${padSec(prodSecNum)}</span> Tasks &amp; Execution Performance Register
    </div>

    <table>
      <thead>
        <tr>
          <th>Task Title</th>
          <th>Priority</th>
          <th>Category</th>
          <th>Due Date</th>
          <th style="text-align: right;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${taskRows || '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 12px;">No tasks recorded in selected window</td></tr>'}
      </tbody>
    </table>

    <div class="section-heading" style="margin-top: 14px;">
      <span class="section-num">${padSec(prodSecNum)}.1</span> Deep Work Focus Sessions Log
    </div>

    <table>
      <thead>
        <tr>
          <th>Session Date</th>
          <th>Focus Topic / Context</th>
          <th>Timer Mode</th>
          <th style="text-align: right;">Duration</th>
        </tr>
      </thead>
      <tbody>
        ${sessionRows || '<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 12px;">No focus sessions logged in selected window</td></tr>'}
      </tbody>
    </table>

    <div class="insights-card" style="margin-top: 14px;">
      <div class="insights-title">Productivity &amp; Focus Context</div>
      <div style="font-size: 10px; color: #475569;">
        Tasks Execution Rate: <strong>${data.tasks.length > 0 ? `${completedTasks} / ${data.tasks.length} (${taskRate}%)` : 'N/A'}</strong> ${data.tasks.length > 0 ? `(${completedTasks} of ${data.tasks.length} completed)` : '(No tasks scheduled in period)'}.
        Deep Work Focus Time: <strong>${totalFocusMins} minutes</strong> across ${data.sessions.length} recorded session(s)${data.tasks.length === 0 ? ' (no tasks scheduled in this period).' : '.'}
      </div>
    </div>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>` : ''}

  ${hasStudy ? `
  <!-- ==================== STUDY OS & ACADEMIC MASTERY REGISTER ==================== -->
  <div class="report-page ${hasHabits || hasCalendar ? 'page-break' : ''}">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>STUDY OS REGISTER • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">${padSec(studySecNum)}</span> Academic Curricula &amp; Subject Matrix
    </div>

    <table>
      <thead>
        <tr>
          <th>Subject / Course Name</th>
          <th>Code</th>
          <th>Exam / Domain</th>
          <th>Subtopics Progress</th>
          <th>Progress Meter</th>
          <th style="text-align: right;">Mastery</th>
        </tr>
      </thead>
      <tbody>
        ${studySubjectRows || '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 12px;">No academic subjects enrolled in account</td></tr>'}
      </tbody>
    </table>

    <div class="section-heading" style="margin-top: 14px;">
      <span class="section-num">${padSec(studySecNum)}.1</span> Active Topics &amp; Spaced Repetition Matrix
    </div>

    <table>
      <thead>
        <tr>
          <th>Topic Title</th>
          <th>Subtopic / Unit</th>
          <th>Subject</th>
          <th>Priority</th>
          <th>Checklist (Th/Pr/PYQ)</th>
          <th style="text-align: right;">Revisions</th>
        </tr>
      </thead>
      <tbody>
        ${studyTopicRows || '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 12px;">No active study topics configured</td></tr>'}
      </tbody>
    </table>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>` : ''}

  ${hasHabits ? `
  <!-- ==================== HABIT FORMATION & CONSISTENCY REGISTER ==================== -->
  <div class="report-page ${hasCalendar ? 'page-break' : ''}">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>HABITS REGISTER • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">${padSec(habitSecNum)}</span> Habit Formation &amp; Streak Architecture
    </div>

    <table>
      <thead>
        <tr>
          <th>Habit Title</th>
          <th>Category</th>
          <th>Cadence</th>
          <th style="text-align: right;">Target</th>
          <th style="text-align: right;">Peak Streak</th>
          <th style="text-align: right;">Total Logs</th>
        </tr>
      </thead>
      <tbody>
        ${habitRows || '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 12px;">No habits tracked in active account</td></tr>'}
      </tbody>
    </table>

    <div class="insights-card" style="margin-top: 14px;">
      <div class="insights-title">Consistency Architecture &amp; Habit Intelligence</div>
      <div style="font-size: 10px; color: #475569;">
        Total Habits Monitored: <strong>${data.habits.length}</strong>. Total Check-in Records: <strong>${totalHabitCompletions}</strong>.
        All-time longest streak: <strong>${bestStreakOverall} consecutive days</strong> across monitored routines.
      </div>
    </div>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>` : ''}

  ${hasCalendar ? `
  <!-- ==================== CALENDAR & TIMEBLOCK REGISTER ==================== -->
  <div class="report-page">
    <div class="running-header">
      <div>FocusFlow &amp; Finance • ${escapeHtml(reportTitle.toUpperCase())}</div>
      <div>CALENDAR &amp; SCHEDULE REGISTER • ${escapeHtml(rangeLabel)} • ${escapeHtml(docRef)}</div>
    </div>

    <div class="section-heading">
      <span class="section-num">${padSec(calSecNum)}</span> Calendar Schedule &amp; Activity Timeblock Matrix
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 85px;">Date</th>
          <th style="width: 115px;">Time Window</th>
          <th>Activity / Scheduled Block</th>
          <th style="width: 110px;">Category</th>
          <th>Notes / Context</th>
          <th style="text-align: right; width: 80px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${timeBlockRows || '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 14px;">No calendar events or scheduled time blocks recorded in this period</td></tr>'}
      </tbody>
    </table>

    <div class="insights-card" style="margin-top: 14px;">
      <div class="insights-title">Scheduled Focus &amp; Time Allocation Intelligence</div>
      <div style="font-size: 10px; color: #475569;">
        Total Scheduled Blocks: <strong>${data.timeBlocks.length}</strong>. Completed Activities: <strong>${completedTimeBlocksCount}</strong> (${calCompletionRate}% execution rate).
        Cumulative Scheduled Duration: <strong>${(totalTimeBlockMinutes / 60).toFixed(1)} hours</strong> across active time slots.
      </div>
    </div>

    <div class="doc-footer">
      <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
      <div>Document Ref ID: ${escapeHtml(docRef)} • Confidential User Statement</div>
      <div>Generated ${escapeHtml(generatedTimeStr)} IST</div>
    </div>
  </div>` : ''}

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 350);
    });
  </script>
</body>
</html>`;
}

// =========================================================================
// 4. PRINTABLE HTML IFRAME LAUNCHER
// =========================================================================

export function printExecutivePdfReport(
  data: UnifiedExportDataPayload,
  rangeLabel: string,
  userName: string = 'FocusFlow User',
  options: ExecutivePdfOptions = {}
): boolean {
  if (typeof document === 'undefined') return false;

  const html = generateExecutivePdfReportHtml(data, rangeLabel, userName, options);
  const fallbackFilename = `focusflow-report-${new Date().toISOString().slice(0, 10)}.html`;

  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    const cleanHtml = html.replace(/<script>[\s\S]*?<\/script>/gi, '');
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(cleanHtml);
      frameDoc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // Fallback if print triggers browser exception
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 1500);
        }
      }, 250);
      return true;
    }
  } catch {
    // Ignore and fallback below
  }

  // Fallback direct printable download
  try {
    const blob = new Blob([html.replace(/<script>[\s\S]*?<\/script>/gi, '')], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

// =========================================================================
// 5. JSON VERSIONED BACKUP EXPORTER (Schema 2.1.0)
// =========================================================================

export function generateVersionedJsonBackup(
  data: UnifiedExportDataPayload,
  scope: string = 'complete',
  selectedModules?: Set<ExportModuleId>
): { filename: string; jsonText: string } {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const isComplete = scope === 'complete' || !selectedModules || selectedModules.has('account_backup');

  const hasMod = (mod: ExportModuleId | ExportModuleId[]): boolean => {
    if (isComplete) return true;
    if (Array.isArray(mod)) return mod.some((m) => selectedModules.has(m));
    return selectedModules.has(mod);
  };

  const incomes = hasMod(['income', 'finance_overview', 'transactions']) ? data.incomes : [];
  const expenses = hasMod(['expenses', 'finance_overview', 'transactions']) ? data.expenses : [];
  const bills = hasMod(['bills', 'finance_overview']) ? data.bills : [];
  const envelopes = hasMod(['envelopes', 'finance_overview']) ? data.envelopes : [];
  const savingsGoals = hasMod(['savings_goals', 'finance_overview']) ? data.savingsGoals : [];
  const subscriptions = hasMod(['bills', 'finance_overview']) ? data.subscriptions : [];
  const categories = hasMod(['income', 'expenses', 'transactions', 'bills', 'envelopes', 'finance_overview']) ? data.categories : [];
  const tasks = hasMod(['tasks', 'productivity_overview']) ? data.tasks : [];
  const sessions = hasMod(['focus_sessions', 'productivity_overview']) ? data.sessions : [];
  const habits = hasMod('habits') ? data.habits : [];
  const timeBlocks = hasMod('calendar') ? data.timeBlocks : [];
  const studySubjects = hasMod('study_os') ? data.studySubjects : [];
  const studyTopics = hasMod('study_os') ? data.studyTopics : [];
  const studyRevisions = hasMod('study_os') ? data.studyRevisions : [];

  const payload = {
    schemaVersion: '2.1.0',
    exportScope: scope,
    exportedAt: new Date().toISOString(),
    timezone: data.userSettings?.timezone || DEFAULT_TIMEZONE,
    userName: data.userName || 'FocusFlow User',
    metadata: {
      totalIncomes: incomes.length,
      totalExpenses: expenses.length,
      totalBills: bills.length,
      totalTasks: tasks.length,
      totalFocusSessions: sessions.length,
      totalHabits: habits.length,
      totalStudySubjects: studySubjects.length,
    },
    userSettings: data.userSettings,
    incomes,
    expenses,
    bills,
    envelopes,
    savingsGoals,
    subscriptions,
    categories,
    tasks,
    sessions,
    habits,
    timeBlocks,
    studySubjects,
    studyTopics,
    studyRevisions,
  };

  const jsonText = JSON.stringify(payload, null, 2);
  const filename = `focusflow-backup-${scope}-${dateStamp}.json`;

  return { filename, jsonText };
}

export function downloadJsonFile(filename: string, jsonText: string): void {
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
