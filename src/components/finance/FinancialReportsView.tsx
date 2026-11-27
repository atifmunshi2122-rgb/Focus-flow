import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Printer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { addDays, getTodayDateString } from '../../lib/dateTime.ts';
import {
  exportSpecificFinancialReportCsv,
  openPrintableSpecificFinancialReport,
} from '../../lib/exportReports.ts';
import type {
  Bill,
  ExpenseTransaction,
  FinancialReportType,
  IncomeTransaction,
  SavingsGoal,
} from '../../types/index.ts';
import { ThemeButton, ThemeCard, ThemeSegmentedControl } from '../ui/ThemePrimitives.tsx';
import { EmptyStateIllustration } from '../ui/MotionPrimitives.tsx';

export const FinancialReportsView: React.FC = () => {
  const { user, currency, settings, refreshKey, showToast, setCurrentTab } = useApp();
  const [reportType, setReportType] = useState<FinancialReportType>('monthly');

  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [savingsGoals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getIncomes().catch(() => []),
      api.getExpenses().catch(() => []),
      api.getBills().catch(() => []),
      api.getSavingsGoals().catch(() => []),
    ])
      .then(([incList, expList, billList, goalList]) => {
        setIncomes(incList);
        setExpenses(expList);
        setBills(billList);
        setGoals(goalList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const activeIncomes = useMemo(() => incomes.filter((i) => !i.deletedAt), [incomes]);
  const activeExpenses = useMemo(() => expenses.filter((e) => !e.deletedAt), [expenses]);
  const activeBills = useMemo(() => bills.filter((b) => !b.deletedAt), [bills]);

  const todayStr = getTodayDateString(settings?.timezone);
  const currentMonthKey = todayStr.slice(0, 7);
  const weekStartStr = addDays(todayStr, -6);

  const dailyExpenses = useMemo(
    () => activeExpenses.filter((e) => e.date === todayStr),
    [activeExpenses, todayStr]
  );
  const weeklyExpenses = useMemo(
    () => activeExpenses.filter((e) => e.date >= weekStartStr && e.date <= todayStr),
    [activeExpenses, weekStartStr, todayStr]
  );
  const monthlyExpenses = useMemo(
    () => activeExpenses.filter((e) => e.date.startsWith(currentMonthKey)),
    [activeExpenses, currentMonthKey]
  );
  const categoryRows = useMemo(() => {
    const map = new Map<string, { name: string; count: number; totalPaise: number }>();
    for (const e of activeExpenses) {
      const name = e.categoryName || e.categoryId || 'Uncategorized';
      const cur = map.get(name) || { name, count: 0, totalPaise: 0 };
      cur.count += 1;
      cur.totalPaise += e.amountPaise;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalPaise - a.totalPaise);
  }, [activeExpenses]);
  const budgetRows = useMemo(() => {
    const spentByCat = new Map<string, number>();
    let monthTotalPaise = 0;
    for (const e of monthlyExpenses) {
      monthTotalPaise += e.amountPaise;
      const catKey = e.categoryId || e.categoryName || 'Uncategorized';
      spentByCat.set(catKey, (spentByCat.get(catKey) || 0) + e.amountPaise);
      if (e.categoryName && e.categoryName !== catKey) {
        spentByCat.set(e.categoryName, (spentByCat.get(e.categoryName) || 0) + e.amountPaise);
      }
    }
    const rows: Array<{ id: string; label: string; spentPaise: number; budgetPaise: number }> = [];
    if (settings?.monthlyBudgetPaise && settings.monthlyBudgetPaise > 0) {
      rows.push({
        id: '__overall__',
        label: 'Overall Monthly Budget',
        spentPaise: monthTotalPaise,
        budgetPaise: settings.monthlyBudgetPaise,
      });
    }
    if (settings?.categoryBudgets) {
      for (const [cat, limitPaise] of Object.entries(settings.categoryBudgets)) {
        if (limitPaise > 0) {
          rows.push({
            id: cat,
            label: cat,
            spentPaise: spentByCat.get(cat) || 0,
            budgetPaise: limitPaise,
          });
        }
      }
    }
    return rows;
  }, [monthlyExpenses, settings?.monthlyBudgetPaise, settings?.categoryBudgets]);

  const reportPayload = useMemo(() => ({
    reportType,
    incomes: activeIncomes,
    expenses: activeExpenses,
    bills: activeBills,
    savingsGoals,
    monthlyBudgetPaise: settings?.monthlyBudgetPaise,
    categoryBudgets: settings?.categoryBudgets,
    currency,
    userName: user?.name,
  }), [reportType, activeIncomes, activeExpenses, activeBills, savingsGoals, settings, currency, user]);

  const handleExportCsv = () => {
    try {
      exportSpecificFinancialReportCsv(reportPayload);
      showToast(`Exported ${reportType} report CSV`, 'success');
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const handlePrint = () => {
    const ok = openPrintableSpecificFinancialReport(reportPayload);
    if (!ok) {
      showToast('Pop-up blocked — allow pop-ups to open the print view.', 'error');
    }
  };

  const totalInflow = activeIncomes.reduce((s, i) => s + i.amountPaise, 0);
  const totalOutflow = activeExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const netBalance = totalInflow - totalOutflow;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Top Header Card */}
      <ThemeCard className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--ff-accent-text)]" />
            Executive Financial Reports &amp; Statements
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            100% deterministic accounting records formatted for print and spreadsheet analysis
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton variant="secondary" size="sm" onClick={() => setCurrentTab('exports')}>
            <Download className="w-3.5 h-3.5" /> Export Center
          </ThemeButton>
          <ThemeButton variant="secondary" size="sm" onClick={handleExportCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </ThemeButton>
          <ThemeButton variant="primary" size="sm" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> Print Statement
          </ThemeButton>
        </div>
      </ThemeCard>

      {/* Report Type Selector */}
      <ThemeSegmentedControl<FinancialReportType>
        ariaLabel="Report Type"
        value={reportType}
        onChange={setReportType}
        options={[
          { id: 'daily', label: 'Daily' },
          { id: 'weekly', label: 'Weekly' },
          { id: 'monthly', label: 'Monthly' },
          { id: 'category', label: 'Category' },
          { id: 'income', label: 'Income' },
          { id: 'expense', label: 'Expenses' },
          { id: 'budget', label: 'Budget' },
        ]}
      />

      {/* Preview Content */}
      <ThemeCard className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)] capitalize">
              {reportType} Accounting Statement Preview
            </h3>
            <span className="text-xs text-[var(--ff-text-muted)]">
              Real-time summary calculated from {activeExpenses.length + activeIncomes.length} records
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-[var(--ff-success)]">In: {formatCurrency(totalInflow, currency)}</span>
            <span className="text-[var(--ff-danger)]">Out: {formatCurrency(totalOutflow, currency)}</span>
            <span className="font-bold text-[var(--ff-text-primary)]">
              Net: {formatCurrency(netBalance, currency)}
            </span>
          </div>
        </div>

        {activeExpenses.length === 0 && activeIncomes.length === 0 ? (
          <EmptyStateIllustration
            icon={<FileText className="w-6 h-6" />}
            title="No financial records to display"
            description="Start logging incomes or expenses to preview and export detailed statements."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--ff-border-color)] text-[var(--ff-text-muted)] font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Date / Item</th>
                  <th className="py-2.5 px-3">Description / Source</th>
                  <th className="py-2.5 px-3">Classification</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y ff-divider">
                {reportType === 'daily' && (
                  dailyExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-[var(--ff-text-muted)]">
                        No expenses logged for today ({todayStr}).
                      </td>
                    </tr>
                  ) : (
                    dailyExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                        <td className="py-2.5 px-3 font-mono">{e.date}</td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{e.description}</td>
                        <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{e.categoryName || e.categoryId}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                          -{formatCurrency(e.amountPaise, currency)}
                        </td>
                      </tr>
                    ))
                  )
                )}

                {reportType === 'weekly' && (
                  weeklyExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-[var(--ff-text-muted)]">
                        No expenses logged in the last 7 days ({weekStartStr} to {todayStr}).
                      </td>
                    </tr>
                  ) : (
                    weeklyExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                        <td className="py-2.5 px-3 font-mono">{e.date}</td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{e.description}</td>
                        <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{e.categoryName || e.categoryId}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                          -{formatCurrency(e.amountPaise, currency)}
                        </td>
                      </tr>
                    ))
                  )
                )}

                {reportType === 'monthly' && (
                  monthlyExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-[var(--ff-text-muted)]">
                        No expenses logged for {currentMonthKey}.
                      </td>
                    </tr>
                  ) : (
                    monthlyExpenses.slice(0, 25).map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                        <td className="py-2.5 px-3 font-mono">{e.date}</td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{e.description}</td>
                        <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{e.categoryName || e.categoryId}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                          -{formatCurrency(e.amountPaise, currency)}
                        </td>
                      </tr>
                    ))
                  )
                )}

                {reportType === 'category' && (
                  categoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-[var(--ff-text-muted)]">
                        No categorized expenses available.
                      </td>
                    </tr>
                  ) : (
                    categoryRows.map((row) => (
                      <tr key={row.name} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                        <td className="py-2.5 px-3 font-mono">{row.count} txns</td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{row.name}</td>
                        <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">
                          {totalOutflow > 0 ? `${Math.round((row.totalPaise / totalOutflow) * 100)}% of spend` : '0%'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                          -{formatCurrency(row.totalPaise, currency)}
                        </td>
                      </tr>
                    ))
                  )
                )}

                {reportType === 'income' && (
                  activeIncomes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-[var(--ff-text-muted)]">
                        No income records available.
                      </td>
                    </tr>
                  ) : (
                    activeIncomes.map((i) => (
                      <tr key={i.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                        <td className="py-2.5 px-3 font-mono">{i.date}</td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{i.source}</td>
                        <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{i.category}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-success)]">
                          +{formatCurrency(i.amountPaise, currency)}
                        </td>
                      </tr>
                    ))
                  )
                )}

                {reportType === 'expense' && (
                  activeExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-[var(--ff-text-muted)]">
                        No expense records available.
                      </td>
                    </tr>
                  ) : (
                    activeExpenses.slice(0, 25).map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                        <td className="py-2.5 px-3 font-mono">{e.date}</td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{e.description}</td>
                        <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{e.categoryName || e.categoryId}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                          -{formatCurrency(e.amountPaise, currency)}
                        </td>
                      </tr>
                    ))
                  )
                )}

                {reportType === 'budget' && (
                  budgetRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-3 text-center text-[var(--ff-text-muted)]">
                        No monthly or category budgets configured yet.
                      </td>
                    </tr>
                  ) : (
                    budgetRows.map((row) => {
                      const remaining = row.budgetPaise - row.spentPaise;
                      const pct = Math.round((row.spentPaise / row.budgetPaise) * 100);
                      return (
                        <tr key={row.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                          <td className="py-2.5 px-3 font-mono">{currentMonthKey}</td>
                          <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{row.label}</td>
                          <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">
                            {formatCurrency(row.spentPaise, currency)} / {formatCurrency(row.budgetPaise, currency)} ({pct}%)
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                              remaining < 0 ? 'text-[var(--ff-danger)]' : 'text-[var(--ff-success)]'
                            }`}
                          >
                            {remaining < 0
                              ? `Over by ${formatCurrency(Math.abs(remaining), currency)}`
                              : `${formatCurrency(remaining, currency)} left`}
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </ThemeCard>
    </div>
  );
};
