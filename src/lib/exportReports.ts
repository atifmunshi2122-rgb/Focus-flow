import type {
  Bill,
  ExpenseTransaction,
  FocusSession,
  IncomeTransaction,
  SavingsGoal,
  Task,
} from '../types/index.ts';
import { formatCurrency } from './currency.ts';

export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildCsvContent(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

export function downloadCsvFile(filename: string, csvText: string): void {
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFinanceCsv(input: {
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  bills: Bill[];
}): void {
  const headers = ['Record Type', 'Date', 'Title / Source', 'Category', 'Status / Method', 'Amount (INR)'];
  const rows: Array<Array<unknown>> = [
    ...input.incomes
      .filter((i) => !i.deletedAt)
      .map((i) => [
        'Income',
        i.date,
        i.source,
        i.category,
        i.notes || 'Credited',
        (i.amountPaise / 100).toFixed(2),
      ]),
    ...input.expenses
      .filter((e) => !e.deletedAt)
      .map((e) => [
        e.type === 'fixed' ? 'Fixed Expense' : 'Variable Expense',
        e.date,
        e.description,
        e.categoryName || e.categoryId,
        e.paymentMethod,
        (-e.amountPaise / 100).toFixed(2),
      ]),
    ...input.bills
      .filter((b) => !b.deletedAt)
      .map((b) => [
        'Bill',
        b.dueDate,
        b.name,
        b.categoryName || b.categoryId,
        b.status,
        (b.amountPaise / 100).toFixed(2),
      ]),
  ];
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`focusflow-finance-${dateStamp}.csv`, buildCsvContent(headers, rows));
}

export function exportProductivityCsv(input: {
  tasks: Task[];
  sessions: FocusSession[];
}): void {
  const headers = ['Entry Type', 'Date', 'Title / Mode', 'Status / Category', 'Duration / Priority', 'Completed'];
  const rows: Array<Array<unknown>> = [
    ...input.tasks
      .filter((t) => !t.deletedAt)
      .map((t) => [
        'Task',
        t.dueDate || t.createdAt.slice(0, 10),
        t.title,
        t.category || 'General',
        t.priority,
        t.status,
      ]),
    ...input.sessions.map((s) => [
      'Focus Session',
      s.startedAt.slice(0, 10),
      s.mode,
      s.taskId || 'Independent',
      `${Math.round(s.durationSeconds / 60)} min`,
      s.completed ? 'Yes' : 'No',
    ]),
  ];
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`focusflow-productivity-${dateStamp}.csv`, buildCsvContent(headers, rows));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openPrintableReport(input: {
  userName: string;
  rangeLabel: string;
  totalFocusMinutes: number;
  completedTasks: number;
  pendingTasks: number;
  totalIncomePaise: number;
  totalExpensePaise: number;
  savingsGoals: SavingsGoal[];
  topCategories: Array<{ name: string; amountPaise: number }>;
}): boolean {
  const win = window.open('', '_blank', 'width=900,height=750');
  if (!win) return false;

  const netPaise = input.totalIncomePaise - input.totalExpensePaise;
  const catRows = input.topCategories
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name)}</td><td style="text-align:right;font-weight:600;">${escapeHtml(formatCurrency(c.amountPaise))}</td></tr>`
    )
    .join('');

  const goalRows = input.savingsGoals
    .map((g) => {
      const pct = g.targetPaise > 0 ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100)) : 0;
      return `<tr><td>${escapeHtml(g.title)}</td><td>${pct}%</td><td style="text-align:right;">${escapeHtml(formatCurrency(g.savedPaise))} / ${escapeHtml(formatCurrency(g.targetPaise))}</td></tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>FocusFlow & Finance Report — ${escapeHtml(input.rangeLabel)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 36px; line-height: 1.5; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .sub { color: #475569; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }
  .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; background: #f8fafc; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 700; }
  .val { font-size: 20px; font-weight: 800; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 24px; font-size: 13px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 9px 6px; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; color: #475569; }
  @media print { body { margin: 16px; } }
</style>
</head>
<body>
  <h1>FocusFlow & Finance Executive Report</h1>
  <div class="sub">Prepared for ${escapeHtml(input.userName)} • Window: ${escapeHtml(input.rangeLabel)} • Generated ${new Date().toLocaleDateString()}</div>
  <div class="grid">
    <div class="card"><div class="label">Focus Logged</div><div class="val">${input.totalFocusMinutes} min</div></div>
    <div class="card"><div class="label">Tasks Completed</div><div class="val">${input.completedTasks} done / ${input.pendingTasks} open</div></div>
    <div class="card"><div class="label">Net Cashflow</div><div class="val">${escapeHtml(formatCurrency(netPaise))}</div></div>
    <div class="card"><div class="label">Total Income</div><div class="val">${escapeHtml(formatCurrency(input.totalIncomePaise))}</div></div>
    <div class="card"><div class="label">Total Expenses</div><div class="val">${escapeHtml(formatCurrency(input.totalExpensePaise))}</div></div>
    <div class="card"><div class="label">Savings Targets</div><div class="val">${input.savingsGoals.length} active</div></div>
  </div>
  <h3>Expense Category Breakdown</h3>
  <table><thead><tr><th>Category</th><th style="text-align:right;">Spent</th></tr></thead><tbody>${catRows || '<tr><td colspan="2">No expenses in period</td></tr>'}</tbody></table>
  <h3>Savings Goals</h3>
  <table><thead><tr><th>Goal</th><th>Progress</th><th style="text-align:right;">Balance</th></tr></thead><tbody>${goalRows || '<tr><td colspan="3">No savings goals configured</td></tr>'}</tbody></table>
  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
