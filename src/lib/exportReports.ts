import type {
  Bill,
  ExpenseTransaction,
  FinancialReportType,
  FocusSession,
  IncomeTransaction,
  SavingsGoal,
  Task,
} from '../types/index.ts';
import { formatCurrency } from './currency.ts';
import { DEFAULT_TIMEZONE, addDays, getTodayDateString } from './dateTime.ts';

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
  const dateStamp = getTodayDateString(DEFAULT_TIMEZONE);
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
  const dateStamp = getTodayDateString(DEFAULT_TIMEZONE);
  downloadCsvFile(`focusflow-productivity-${dateStamp}.csv`, buildCsvContent(headers, rows));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printHtmlDocument(html: string, fallbackFilename: string): boolean {
  if (typeof document === 'undefined') return false;
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
          // Ignore print errors in headless environments
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 1500);
        }
      }, 200);
      return true;
    }

    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  } catch {
    // Fallback below
  }

  // Fallback: download clean printable HTML file directly if iframe printing is blocked
  try {
    const blob = new Blob([html.replace(/<script>[\s\S]*?<\/script>/gi, '')], {
      type: 'text/html;charset=utf-8;',
    });
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
  const netPaise = input.totalIncomePaise - input.totalExpensePaise;
  const totalExp = input.totalExpensePaise;

  const catRows = input.topCategories
    .map((c) => {
      const pct = totalExp > 0 ? Math.round((c.amountPaise / totalExp) * 100) : 0;
      return `
        <tr>
          <td style="padding: 7px 10px; font-weight: 600; color: #0f172a; font-size: 11px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#7c3aed;margin-right:6px;"></span>
            ${escapeHtml(c.name)}
          </td>
          <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-weight: 700; color: #e11d48; font-size: 11px;">
            ${escapeHtml(formatCurrency(c.amountPaise))}
          </td>
          <td style="padding: 7px 10px; text-align: right; font-weight: 600; color: #64748b; font-size: 11px;">${pct}%</td>
          <td style="padding: 7px 10px; width: 140px;">
            <div style="background: #f1f5f9; border-radius: 9999px; height: 6px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #7c3aed, #6366f1); height: 100%; width: ${Math.min(100, pct)}%;"></div>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  const goalRows = input.savingsGoals
    .map((g) => {
      const pct = g.targetPaise > 0 ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100)) : 0;
      return `
        <tr>
          <td style="padding: 7px 10px; font-weight: 600; color: #0f172a; font-size: 11px;">${escapeHtml(g.title)}</td>
          <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-size: 11px; color: #0f172a;">${escapeHtml(formatCurrency(g.targetPaise))}</td>
          <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-size: 11px; color: #059669; font-weight: 700;">${escapeHtml(formatCurrency(g.savedPaise))}</td>
          <td style="padding: 7px 10px; width: 120px;">
            <div style="background: #f1f5f9; border-radius: 9999px; height: 6px; overflow: hidden;">
              <div style="background: #10b981; height: 100%; width: ${pct}%;"></div>
            </div>
          </td>
          <td style="padding: 7px 10px; text-align: right; font-weight: 700; font-size: 11px; color: #64748b;">${pct}%</td>
        </tr>`;
    })
    .join('');

  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>FocusFlow &amp; Finance — Executive Intelligence Report</title>
<style>
  @page { size: A4 portrait; margin: 14mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #ffffff; margin: 0; padding: 0; line-height: 1.45; font-size: 11px; }
  .header-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; background: radial-gradient(circle at 90% 10%, #faf5ff 0%, #ffffff 60%); margin-bottom: 20px; }
  .brand-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 14px; }
  .brand-logo { font-size: 13px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: #0f172a; }
  .badge { background: #0f172a; color: #ffffff; font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
  .title { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; margin: 0 0 6px 0; color: #0f172a; }
  .meta-sub { font-size: 11px; color: #64748b; margin-bottom: 0; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
  .kpi-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 3px; }
  .kpi-val { font-size: 16px; font-weight: 900; font-family: monospace; color: #0f172a; }
  .section-title { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: #0f172a; border-left: 3px solid #7c3aed; padding-left: 8px; margin: 20px 0 10px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10.5px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th { background: #0f172a; color: #ffffff; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 7px 10px; text-align: left; }
  td { padding: 6.5px 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
  tbody tr:nth-child(even) { background: #fafafd; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 24px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="header-card">
    <div class="brand-bar">
      <div class="brand-logo">FocusFlow &amp; Finance</div>
      <div class="badge">Certified Audit Report</div>
    </div>
    <h1 class="title">Executive Performance &amp; Financial Dossier</h1>
    <div class="meta-sub">Prepared for: <strong>${escapeHtml(input.userName)}</strong> • Reporting Window: <strong>${escapeHtml(input.rangeLabel)}</strong> • Generated: <strong>${escapeHtml(dateStr)} IST</strong></div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Total Inflows</div><div class="kpi-val" style="color: #059669;">+${escapeHtml(formatCurrency(input.totalIncomePaise))}</div></div>
    <div class="kpi-card"><div class="kpi-label">Total Outflows</div><div class="kpi-val" style="color: #e11d48;">-${escapeHtml(formatCurrency(input.totalExpensePaise))}</div></div>
    <div class="kpi-card"><div class="kpi-label">Net Financial Flow</div><div class="kpi-val" style="color: ${netPaise >= 0 ? '#059669' : '#e11d48'};">${netPaise >= 0 ? '+' : '-'}${escapeHtml(formatCurrency(Math.abs(netPaise)))}</div></div>
    <div class="kpi-card"><div class="kpi-label">Focus Time Logged</div><div class="kpi-val" style="color: #7c3aed;">${input.totalFocusMinutes} mins</div></div>
    <div class="kpi-card"><div class="kpi-label">Tasks Velocity</div><div class="kpi-val">${input.completedTasks} done / ${input.pendingTasks} open</div></div>
    <div class="kpi-card"><div class="kpi-label">Active Wealth Targets</div><div class="kpi-val">${input.savingsGoals.length} goals</div></div>
  </div>

  <div class="section-title">Expense Category Distribution</div>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right;">Total Spent</th><th style="text-align:right;">Share</th><th>Distribution</th></tr></thead>
    <tbody>${catRows || '<tr><td colspan="4" style="text-align:center;padding:12px;color:#94a3b8;">No expenses recorded in this period</td></tr>'}</tbody>
  </table>

  ${input.savingsGoals.length > 0 ? `
  <div class="section-title">Savings Goals Progression</div>
  <table>
    <thead><tr><th>Goal Name</th><th style="text-align:right;">Target</th><th style="text-align:right;">Saved</th><th>Progress</th><th style="text-align:right;">Completion</th></tr></thead>
    <tbody>${goalRows}</tbody>
  </table>` : ''}

  <div class="footer">
    <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
    <div>Confidential Executive Statement • Generated ${escapeHtml(dateStr)} IST</div>
  </div>

  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 300); });</script>
</body>
</html>`;

  return printHtmlDocument(
    html,
    `focusflow-report-${getTodayDateString(DEFAULT_TIMEZONE)}.html`
  );
}

export interface SpecificReportInput {
  reportType: FinancialReportType;
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  bills: Bill[];
  savingsGoals: SavingsGoal[];
  monthlyBudgetPaise?: number;
  categoryBudgets?: Record<string, number>;
  currency?: string;
  userName?: string;
}

export function exportSpecificFinancialReportCsv(input: SpecificReportInput): void {
  const { reportType, incomes, expenses, bills, savingsGoals, monthlyBudgetPaise, categoryBudgets } = input;
  const activeIncomes = incomes.filter((i) => !i.deletedAt);
  const activeExpenses = expenses.filter((e) => !e.deletedAt);
  const activeBills = bills.filter((b) => !b.deletedAt);
  const nowStr = getTodayDateString(DEFAULT_TIMEZONE);
  const currMonthKey = nowStr.slice(0, 7);

  let headers: string[] = [];
  let rows: Array<Array<unknown>> = [];
  let filename = `focusflow-${reportType}-report-${nowStr}.csv`;

  switch (reportType) {
    case 'daily': {
      headers = ['Time / Date', 'Type', 'Description', 'Category', 'Payment Method', 'Amount (INR)'];
      const todayIncomes = activeIncomes.filter((i) => i.date === nowStr);
      const todayExpenses = activeExpenses.filter((e) => e.date === nowStr);
      rows = [
        ...todayIncomes.map((i) => [i.date, 'Income', i.source, i.category, i.notes || 'Credited', (i.amountPaise / 100).toFixed(2)]),
        ...todayExpenses.map((e) => [e.date, 'Expense', e.description, e.categoryName || e.categoryId, e.paymentMethod, (-e.amountPaise / 100).toFixed(2)]),
      ];
      break;
    }
    case 'weekly': {
      headers = ['Date', 'Inflow (INR)', 'Outflow (INR)', 'Net Flow (INR)', 'Transactions Count'];
      const dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        dates.push(addDays(nowStr, -i));
      }
      rows = dates.map((d) => {
        const dInc = activeIncomes.filter((i) => i.date === d).reduce((s, i) => s + i.amountPaise, 0);
        const dExp = activeExpenses.filter((e) => e.date === d).reduce((s, e) => s + e.amountPaise, 0);
        const count = activeIncomes.filter((i) => i.date === d).length + activeExpenses.filter((e) => e.date === d).length;
        return [d, (dInc / 100).toFixed(2), (dExp / 100).toFixed(2), ((dInc - dExp) / 100).toFixed(2), count];
      });
      break;
    }
    case 'monthly': {
      headers = ['Month Key', 'Total Income (INR)', 'Total Expenses (INR)', 'Net Savings (INR)', 'Savings Rate (%)'];
      const monthMap: Record<string, { inc: number; exp: number }> = {};
      for (const inc of activeIncomes) {
        const m = inc.date.slice(0, 7);
        monthMap[m] = monthMap[m] || { inc: 0, exp: 0 };
        monthMap[m].inc += inc.amountPaise;
      }
      for (const exp of activeExpenses) {
        const m = exp.date.slice(0, 7);
        monthMap[m] = monthMap[m] || { inc: 0, exp: 0 };
        monthMap[m].exp += exp.amountPaise;
      }
      const sortedMonths = Object.keys(monthMap).sort().reverse();
      rows = sortedMonths.map((m) => {
        const inc = monthMap[m].inc;
        const exp = monthMap[m].exp;
        const net = inc - exp;
        const rate = inc > 0 ? Math.max(0, (net / inc) * 100).toFixed(1) : '0.0';
        return [m, (inc / 100).toFixed(2), (exp / 100).toFixed(2), (net / 100).toFixed(2), `${rate}%`];
      });
      break;
    }
    case 'category': {
      headers = ['Category', 'Month To Date Spent (INR)', 'Budget Limit (INR)', 'Transactions Count', 'Utilization (%)'];
      const catMap: Record<string, { spent: number; count: number }> = {};
      const thisMonthExp = activeExpenses.filter((e) => e.date.startsWith(currMonthKey));
      for (const exp of thisMonthExp) {
        const name = exp.categoryName || exp.categoryId || 'General';
        catMap[name] = catMap[name] || { spent: 0, count: 0 };
        catMap[name].spent += exp.amountPaise;
        catMap[name].count += 1;
      }
      rows = Object.entries(catMap).map(([name, data]) => {
        const budgetCap = categoryBudgets?.[name] || 0;
        const util = budgetCap > 0 ? `${Math.round((data.spent / budgetCap) * 100)}%` : 'No Cap';
        return [name, (data.spent / 100).toFixed(2), (budgetCap / 100).toFixed(2), data.count, util];
      });
      break;
    }
    case 'income': {
      headers = ['Date', 'Source', 'Category', 'Amount (INR)', 'Notes'];
      rows = activeIncomes.map((i) => [i.date, i.source, i.category, (i.amountPaise / 100).toFixed(2), i.notes || '']);
      break;
    }
    case 'expense': {
      headers = ['Date', 'Description', 'Category', 'Type', 'Payment Method', 'Amount (INR)', 'Notes'];
      rows = activeExpenses.map((e) => [
        e.date,
        e.description,
        e.categoryName || e.categoryId,
        e.type,
        e.paymentMethod,
        (e.amountPaise / 100).toFixed(2),
        e.notes || '',
      ]);
      break;
    }
    case 'budget': {
      headers = ['Budget Target', 'Allocated Cap (INR)', 'Spent This Month (INR)', 'Remaining Headroom (INR)', 'Utilization (%)'];
      const spentThisMonth = activeExpenses
        .filter((e) => e.date.startsWith(currMonthKey))
        .reduce((s, e) => s + e.amountPaise, 0);
      const cap = monthlyBudgetPaise || 0;
      const remaining = Math.max(0, cap - spentThisMonth);
      const util = cap > 0 ? `${Math.round((spentThisMonth / cap) * 100)}%` : 'N/A';
      rows = [['Overall Monthly Cap', (cap / 100).toFixed(2), (spentThisMonth / 100).toFixed(2), (remaining / 100).toFixed(2), util]];
      if (categoryBudgets) {
        for (const [catId, catCap] of Object.entries(categoryBudgets)) {
          const catSpent = activeExpenses
            .filter((e) => e.date.startsWith(currMonthKey) && (e.categoryId === catId || e.categoryName === catId))
            .reduce((s, e) => s + e.amountPaise, 0);
          const catRemain = Math.max(0, catCap - catSpent);
          const catUtil = catCap > 0 ? `${Math.round((catSpent / catCap) * 100)}%` : 'N/A';
          rows.push([`Category: ${catId}`, (catCap / 100).toFixed(2), (catSpent / 100).toFixed(2), (catRemain / 100).toFixed(2), catUtil]);
        }
      }
      break;
    }
  }

  downloadCsvFile(filename, buildCsvContent(headers, rows));
}

export function openPrintableSpecificFinancialReport(input: SpecificReportInput): boolean {
  const { reportType, incomes, expenses, userName } = input;
  const activeIncomes = incomes.filter((i) => !i.deletedAt);
  const activeExpenses = expenses.filter((e) => !e.deletedAt);
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const totalInflow = activeIncomes.reduce((s, i) => s + i.amountPaise, 0);
  const totalOutflow = activeExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const net = totalInflow - totalOutflow;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>FocusFlow &amp; Finance — ${escapeHtml(reportType.toUpperCase())} Statement</title>
<style>
  @page { size: A4 portrait; margin: 14mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #ffffff; margin: 0; padding: 0; line-height: 1.45; font-size: 11px; }
  .header-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; background: radial-gradient(circle at 90% 10%, #faf5ff 0%, #ffffff 60%); margin-bottom: 20px; }
  .brand-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 14px; }
  .brand-logo { font-size: 13px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: #0f172a; }
  .badge { background: #0f172a; color: #ffffff; font-size: 9px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
  .title { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; margin: 0 0 6px 0; color: #0f172a; text-transform: capitalize; }
  .meta-sub { font-size: 11px; color: #64748b; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
  .kpi-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 3px; }
  .kpi-val { font-size: 16px; font-weight: 900; font-family: monospace; color: #0f172a; }
  .section-title { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: #0f172a; border-left: 3px solid #7c3aed; padding-left: 8px; margin: 20px 0 10px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10.5px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th { background: #0f172a; color: #ffffff; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 7px 10px; text-align: left; }
  td { padding: 6.5px 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
  tbody tr:nth-child(even) { background: #fafafd; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 24px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="header-card">
    <div class="brand-bar">
      <div class="brand-logo">FocusFlow &amp; Finance</div>
      <div class="badge">${escapeHtml(reportType)} Audit</div>
    </div>
    <h1 class="title">${escapeHtml(reportType)} Financial Statement</h1>
    <div class="meta-sub">Account: <strong>${escapeHtml(userName || 'Verified User')}</strong> • Certified Accounting Ledger • Generated: <strong>${escapeHtml(dateStr)} IST</strong></div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Total Credits</div><div class="kpi-val" style="color: #059669;">+${escapeHtml(formatCurrency(totalInflow))}</div></div>
    <div class="kpi-card"><div class="kpi-label">Total Debits</div><div class="kpi-val" style="color: #e11d48;">-${escapeHtml(formatCurrency(totalOutflow))}</div></div>
    <div class="kpi-card"><div class="kpi-label">Net Operating Flow</div><div class="kpi-val" style="color: ${net >= 0 ? '#059669' : '#e11d48'};">${net >= 0 ? '+' : '-'}${escapeHtml(formatCurrency(Math.abs(net)))}</div></div>
  </div>

  <div class="section-title">Itemized Transactions Register</div>
  <table>
    <thead><tr><th>Date</th><th>Description / Payee</th><th>Category</th><th style="text-align:right;">Amount (INR)</th></tr></thead>
    <tbody>
      ${activeExpenses.slice(0, 30).map((e) => `<tr><td style="font-family:monospace;font-size:10.5px;color:#64748b;">${escapeHtml(e.date)}</td><td style="font-weight:600;">${escapeHtml(e.description)}</td><td style="color:#64748b;">${escapeHtml(e.categoryName || e.categoryId)}</td><td style="text-align:right;color:#e11d48;font-family:monospace;font-weight:700;">-${escapeHtml(formatCurrency(e.amountPaise))}</td></tr>`).join('')}
    </tbody>
  </table>

  <div class="footer">
    <div>FocusFlow &amp; Finance OS • Verified Local Ledger Audit Statement</div>
    <div>Confidential Financial Statement • Generated ${escapeHtml(dateStr)} IST</div>
  </div>

  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });</script>
</body>
</html>`;

  return printHtmlDocument(
    html,
    `focusflow-${reportType}-statement-${getTodayDateString(DEFAULT_TIMEZONE)}.html`
  );
}
