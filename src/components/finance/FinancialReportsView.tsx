import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Printer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
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
  const { user, currency, settings, refreshKey, showToast } = useApp();
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

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthKey = todayStr.slice(0, 7);

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
                {reportType === 'daily' &&
                  activeExpenses
                    .filter((e) => e.date === todayStr)
                    .map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                        <td className="py-2.5 px-3 font-mono">{e.date}</td>
                        <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{e.description}</td>
                        <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{e.categoryName || e.categoryId}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                          -{formatCurrency(e.amountPaise, currency)}
                        </td>
                      </tr>
                    ))}

                {reportType === 'monthly' &&
                  activeExpenses.slice(0, 15).map((e) => (
                    <tr key={e.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                      <td className="py-2.5 px-3 font-mono">{e.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{e.description}</td>
                      <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{e.categoryName || e.categoryId}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                        -{formatCurrency(e.amountPaise, currency)}
                      </td>
                    </tr>
                  ))}

                {reportType === 'income' &&
                  activeIncomes.map((i) => (
                    <tr key={i.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                      <td className="py-2.5 px-3 font-mono">{i.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{i.source}</td>
                      <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{i.category}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-success)]">
                        +{formatCurrency(i.amountPaise, currency)}
                      </td>
                    </tr>
                  ))}

                {reportType !== 'income' && reportType !== 'daily' && reportType !== 'monthly' &&
                  activeExpenses.slice(0, 15).map((e) => (
                    <tr key={e.id} className="hover:bg-[var(--ff-surface-subtle)] transition-colors">
                      <td className="py-2.5 px-3 font-mono">{e.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-[var(--ff-text-primary)]">{e.description}</td>
                      <td className="py-2.5 px-3 text-[var(--ff-text-muted)]">{e.categoryName || e.categoryId}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--ff-danger)]">
                        -{formatCurrency(e.amountPaise, currency)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </ThemeCard>
    </div>
  );
};
