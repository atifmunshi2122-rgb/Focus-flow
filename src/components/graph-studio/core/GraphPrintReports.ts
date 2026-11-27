import { CurrencyCode, Habit, Task, FocusSession, IncomeTransaction, ExpenseTransaction, BudgetEnvelope, SavingsGoal } from '../../../types/index.ts';
import { StudySubject, StudyTopic } from '../../../types/study.ts';
import { formatCurrency } from '../../../lib/currency.ts';
import { computeHabitStreak } from '../../../lib/productivityIntelligence.ts';

export interface GraphStudioReportParams {
  userName?: string;
  currency: CurrencyCode;
  startDateStr: string;
  endDateStr: string;
  timeframeLabel: string;
  summaryMetrics: {
    focusHours: number;
    focusSessionsCount: number;
    tasksCompletedCount: number;
    netFlowPaise: number;
    inflowPaise: number;
    outflowPaise: number;
    syllabusRate: number;
    activeSubjectsCount: number;
    habitHits: number;
    activeHabitsCount: number;
  };
  subjects: StudySubject[];
  topics: StudyTopic[];
  sessions: FocusSession[];
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  envelopes: BudgetEnvelope[];
  goals: SavingsGoal[];
  tasks: Task[];
  habits: Habit[];
}

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function openPrintableGraphStudioReport(params: GraphStudioReportParams): boolean {
  const {
    userName = 'FocusFlow Operator',
    currency,
    startDateStr,
    endDateStr,
    timeframeLabel,
    summaryMetrics,
    subjects,
    topics,
    sessions,
    incomes,
    expenses,
    envelopes,
    goals,
    tasks,
    habits,
  } = params;

  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // 1. Study Subject Rows
  const subjectRows = subjects
    .map((sub) => {
      const subTopics = topics.filter((t) => !t.deletedAt && t.subjectCode === sub.code);
      const completedCount = subTopics.filter((t) => t.theory && t.practice && t.pyq).length;
      const rate = subTopics.length > 0 ? Math.round((completedCount / subTopics.length) * 100) : 0;
      return `
        <tr>
          <td><strong>${escapeHtml(sub.code)}</strong></td>
          <td>${escapeHtml(sub.name)}</td>
          <td style="text-align:center;">${subTopics.length}</td>
          <td style="text-align:center;">${completedCount}</td>
          <td style="text-align:right;font-weight:700;">${rate}%</td>
        </tr>
      `;
    })
    .join('');

  // 2. Expense Category Aggregation
  const catMap = new Map<string, number>();
  expenses
    .filter((e) => !e.deletedAt && e.date && e.date >= startDateStr && e.date <= endDateStr)
    .forEach((e) => {
      const cat = e.categoryName || 'General';
      catMap.set(cat, (catMap.get(cat) || 0) + e.amountPaise);
    });

  const categoryRows = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, amountPaise]) => {
      const share = summaryMetrics.outflowPaise > 0 ? Math.round((amountPaise / summaryMetrics.outflowPaise) * 100) : 0;
      return `
        <tr>
          <td>${escapeHtml(cat)}</td>
          <td style="text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(amountPaise, currency))}</td>
          <td style="text-align:right;font-family:monospace;">${share}%</td>
        </tr>
      `;
    })
    .join('');

  // 3. Habit Adherence Rows
  const habitRows = habits
    .filter((h) => !h.deletedAt && !h.archived)
    .map((h) => {
      const hitsInRange = h.completedDates.filter((d) => d >= startDateStr && d <= endDateStr).length;
      const streakInfo = computeHabitStreak(h);
      return `
        <tr>
          <td><strong>${escapeHtml(h.title)}</strong></td>
          <td>${escapeHtml(h.frequency || 'Daily')}</td>
          <td style="text-align:center;">${escapeHtml(streakInfo.currentStreak || 0)}d</td>
          <td style="text-align:center;">${escapeHtml(Math.max(h.bestStreakDays || 0, streakInfo.longestStreak))}d</td>
          <td style="text-align:right;font-weight:700;">${hitsInRange} times</td>
        </tr>
      `;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>FocusFlow &amp; Finance — Advanced Graph Studio Report</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      line-height: 1.4;
      font-size: 11px;
    }
    .print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 10px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .print-btn {
      background: #0f172a;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      .print-bar { display: none; }
      body { padding: 0; }
    }
    .header-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      background: #f8fafc;
      margin-bottom: 18px;
    }
    .brand-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .brand-logo {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0f172a;
    }
    .badge {
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .title {
      font-size: 20px;
      font-weight: 800;
      margin: 0 0 4px 0;
      color: #0f172a;
    }
    .meta-sub {
      font-size: 11px;
      color: #64748b;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px;
    }
    .kpi-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .kpi-val {
      font-size: 16px;
      font-weight: 800;
      font-family: monospace;
      color: #0f172a;
    }
    .section-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0f172a;
      border-left: 3px solid #6366f1;
      padding-left: 8px;
      margin: 18px 0 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 10.5px;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 6px 8px;
      text-align: left;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
    }
    tbody tr:nth-child(even) { background: #fbfcfe; }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <div><strong>Advanced Graph Studio Dossier</strong> — Press Print to produce an executive hardcopy or PDF.</div>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="header-card">
    <div class="brand-bar">
      <div class="brand-logo">FocusFlow &amp; Finance</div>
      <div class="badge">Advanced Graph Studio Dossier</div>
    </div>
    <h1 class="title">Visual Ledger Performance Audit</h1>
    <div class="meta-sub">
      Operator: <strong>${escapeHtml(userName)}</strong> • Timeframe: <strong>${escapeHtml(timeframeLabel)} (${escapeHtml(startDateStr)} to ${escapeHtml(endDateStr)})</strong> • Generated: <strong>${escapeHtml(nowStr)}</strong>
    </div>
  </div>

  <!-- KPI Grid -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Focus Volume</div>
      <div class="kpi-val" style="color: #6366f1;">${summaryMetrics.focusHours}h (${summaryMetrics.focusSessionsCount} sessions)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tasks Completed</div>
      <div class="kpi-val">${summaryMetrics.tasksCompletedCount} items</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Net Operating Flow</div>
      <div class="kpi-val" style="color: ${summaryMetrics.netFlowPaise >= 0 ? '#10b981' : '#ef4444'};">
        ${summaryMetrics.netFlowPaise >= 0 ? '+' : ''}${escapeHtml(formatCurrency(summaryMetrics.netFlowPaise, currency))}
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Curriculum Mastery</div>
      <div class="kpi-val">${summaryMetrics.syllabusRate}% complete</div>
    </div>
  </div>

  <!-- Study Section -->
  <div class="section-title">Study OS Curriculum &amp; Syllabus Status</div>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Subject Name</th>
        <th style="text-align:center;">Total Topics</th>
        <th style="text-align:center;">Completed</th>
        <th style="text-align:right;">Mastery (%)</th>
      </tr>
    </thead>
    <tbody>
      ${subjectRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No enrolled subjects registered</td></tr>'}
    </tbody>
  </table>

  <!-- Finance Section -->
  <div class="section-title">Operating Cashflow &amp; Top Expense Categories</div>
  <table>
    <thead>
      <tr>
        <th>Category Name</th>
        <th style="text-align:right;">Amount Spent</th>
        <th style="text-align:right;">Share of Outflow</th>
      </tr>
    </thead>
    <tbody>
      ${categoryRows || '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">No expenses recorded in this timeframe</td></tr>'}
    </tbody>
  </table>

  <!-- Habit Section -->
  <div class="section-title">Habit Adherence &amp; Streak Reliability</div>
  <table>
    <thead>
      <tr>
        <th>Habit Name</th>
        <th>Frequency</th>
        <th style="text-align:center;">Current Streak</th>
        <th style="text-align:center;">Best Streak</th>
        <th style="text-align:right;">Window Hits</th>
      </tr>
    </thead>
    <tbody>
      ${habitRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No active habits tracked</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <div>FocusFlow &amp; Finance v1.8.0 • Verified Local Ledger Intelligence</div>
    <div>Confidential Operational Statement • Page 1 of 1</div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 350);
    });
  </script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
  }
  return false;
}
