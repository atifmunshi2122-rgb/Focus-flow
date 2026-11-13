import React, { useEffect, useState } from 'react';
import {
  PiggyBank,
  Plus,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import {
  ExpenseCategory,
  FinanceSummaryData,
  SavingsGoal,
} from '../../types/index.ts';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { ThemeBadge, ThemeButton, ThemeCard, ThemeInput, ThemeSelect } from '../ui/ThemePrimitives.tsx';
import { AnimatedProgressBar, EmptyStateIllustration } from '../ui/MotionPrimitives.tsx';

export const BudgetSavingsManager: React.FC<{ showBudgets?: boolean; showSavings?: boolean }> = ({
  showBudgets = true,
  showSavings = true,
}) => {
  const { settings, updateSettings, currency, refreshKey, showToast, triggerRefresh, confirmAction } = useApp();
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  // Monthly budget input (display rupees/major unit)
  const [monthlyBudgetInput, setMonthlyBudgetInput] = useState('50000');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [catBudgetInput, setCatBudgetInput] = useState('');

  // New Savings Goal form
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTargetInput, setGoalTargetInput] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [contribAmounts, setContribAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings?.monthlyBudgetPaise !== undefined) {
      setMonthlyBudgetInput(String(Math.round(settings.monthlyBudgetPaise / 100)));
    }
  }, [settings?.monthlyBudgetPaise]);

  useEffect(() => {
    Promise.all([
      api.getFinanceSummary('this_month').catch(() => null),
      api.getCategories().catch(() => [] as ExpenseCategory[]),
      api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
    ])
      .then(([sum, cats, gs]) => {
        setSummary(sum);
        setCategories(cats);
        setGoals(gs);
        if (!selectedCatId && cats.length > 0) {
          setSelectedCatId(cats[0].id);
        }
      })
      .catch(console.error);
  }, [refreshKey]);

  const handleSaveMonthlyBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(monthlyBudgetInput);
    if (!Number.isFinite(num) || num < 0) {
      showToast('Enter a valid non-negative budget cap', 'error');
      return;
    }
    await updateSettings({ monthlyBudgetPaise: toPaise(num) });
  };

  const handleSaveCategoryBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId) return;
    const num = Number(catBudgetInput);
    if (!Number.isFinite(num) || num < 0) {
      showToast('Enter a valid category budget amount', 'error');
      return;
    }
    const nextMap = { ...(settings?.categoryBudgets || {}) };
    if (num === 0) delete nextMap[selectedCatId];
    else nextMap[selectedCatId] = toPaise(num);
    await updateSettings({ categoryBudgets: nextMap });
    setCatBudgetInput('');
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = goalTitle.trim();
    const targetNum = Number(goalTargetInput);
    if (!title || !Number.isFinite(targetNum) || targetNum <= 0) {
      showToast('Enter a goal name and positive target amount', 'error');
      return;
    }
    try {
      const created = await api.createSavingsGoal({
        title,
        targetPaise: toPaise(targetNum),
        targetDate: goalDate || null,
        color: '#10b981',
      });
      void googleSheetsService.enqueueMutation(
        'Savings_Goals',
        [
          created.id,
          created.title,
          created.targetPaise / 100,
          created.savedPaise / 100,
          0,
          created.targetDate || 'No Deadline',
        ],
        'append',
        `Savings_Goals_append_${created.id}`
      );
      setGoalTitle('');
      setGoalTargetInput('');
      setGoalDate('');
      showToast(`Created savings goal "${title}"`, 'success');
      triggerRefresh();
    } catch {
      showToast('Failed to create savings goal', 'error');
    }
  };

  const handleAdjustGoal = async (goal: SavingsGoal, sign: 1 | -1) => {
    const raw = Number(contribAmounts[goal.id] || '1000');
    if (!Number.isFinite(raw) || raw <= 0) {
      showToast('Enter a positive amount to adjust', 'error');
      return;
    }
    const deltaPaise = toPaise(raw) * sign;
    if (goal.savedPaise + deltaPaise < 0) {
      showToast('Cannot withdraw more than current saved balance', 'error');
      return;
    }
    try {
      await api.contributeSavingsGoal(goal.id, deltaPaise);
      setContribAmounts((prev) => ({ ...prev, [goal.id]: '' }));
      showToast(sign > 0 ? 'Added savings deposit' : 'Recorded withdrawal', 'success');
      triggerRefresh();
    } catch {
      showToast('Failed to update savings balance', 'error');
    }
  };

  const handleDeleteGoal = async (goal: SavingsGoal) => {
    const confirmed = await confirmAction({
      title: 'Delete Savings Goal',
      message: 'Remove this savings goal and its progress tracker?',
      itemLabel: `${goal.title} · ${formatCurrency(goal.savedPaise, currency)} / ${formatCurrency(goal.targetPaise, currency)}`,
      confirmLabel: 'Delete Goal',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteSavingsGoal(goal.id);
      showToast('Savings goal deleted', 'info');
      triggerRefresh();
    } catch {
      showToast('Failed to delete goal', 'error');
    }
  };

  const monthlyCapPaise = settings?.monthlyBudgetPaise || 0;
  const spentThisMonthPaise = summary?.totalExpensePaise || 0;
  const budgetPct =
    monthlyCapPaise > 0 ? Math.round((spentThisMonthPaise / monthlyCapPaise) * 100) : 0;
  const warnThreshold = settings?.notificationPrefs?.budgetWarningPercent || 80;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);
  const remainingBudgetPaise = Math.max(0, monthlyCapPaise - spentThisMonthPaise);
  const baselineDailyAllowance = Math.round(monthlyCapPaise / daysInMonth);
  const dynamicDailySafeLimit = Math.round(remainingBudgetPaise / daysRemaining);
  const isOverDailySafeLimit = dynamicDailySafeLimit > 0 && (spentThisMonthPaise / Math.max(1, currentDay)) > baselineDailyAllowance;

  return (
    <div className="space-y-6">
      {showBudgets && (
        <ThemeCard className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
                <Target className="w-4 h-4 text-[var(--ff-accent-text)]" />
                Monthly &amp; Category Expense Budgets
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Deterministic guardrails alerting at {warnThreshold}% and 100% capacity
              </p>
            </div>
            {monthlyCapPaise > 0 && (
              <ThemeBadge
                tone={
                  budgetPct >= 100 ? 'danger' : budgetPct >= warnThreshold ? 'warning' : 'success'
                }
              >
                {budgetPct >= 100 ? (
                  <>
                    <AlertTriangle className="w-3 h-3 mr-1" /> Over Budget ({budgetPct}%)
                  </>
                ) : budgetPct >= warnThreshold ? (
                  <>
                    <AlertTriangle className="w-3 h-3 mr-1" /> Approaching Limit ({budgetPct}%)
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3 mr-1" /> On Track ({budgetPct}%)
                  </>
                )}
              </ThemeBadge>
            )}
          </div>

          {monthlyCapPaise > 0 && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-[var(--ff-text-secondary)] font-semibold">
                    This Month Utilization
                  </span>
                  <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                    {formatCurrency(spentThisMonthPaise, currency)} /{' '}
                    {formatCurrency(monthlyCapPaise, currency)}
                  </span>
                </div>
                <AnimatedProgressBar
                  value={budgetPct}
                  tone={
                    budgetPct >= 100
                      ? 'danger'
                      : budgetPct >= warnThreshold
                        ? 'warning'
                        : 'success'
                  }
                  pulsing={budgetPct >= 85}
                  showShimmer={budgetPct < 85}
                  heightClass="h-2.5"
                  ariaLabel="Monthly budget utilization"
                />
              </div>

              {/* Daily Safe-to-Spend & Pacing Guardrail Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)]">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--ff-text-muted)] block">
                    Remaining Budget
                  </span>
                  <span className="text-sm font-bold font-mono text-[var(--ff-text-primary)] block mt-0.5">
                    {formatCurrency(remainingBudgetPaise, currency)}
                  </span>
                  <span className="text-[10px] text-[var(--ff-text-muted)] mt-0.5 block">
                    {daysRemaining} day{daysRemaining > 1 ? 's' : ''} left this month
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)]">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--ff-text-muted)] block">
                    Daily Safe Allowance
                  </span>
                  <span className="text-sm font-bold font-mono text-[var(--ff-accent-text)] block mt-0.5">
                    {formatCurrency(dynamicDailySafeLimit, currency)}/day
                  </span>
                  <span className="text-[10px] text-[var(--ff-text-muted)] mt-0.5 block">
                    Base: {formatCurrency(baselineDailyAllowance, currency)}/day
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)]">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--ff-text-muted)] block">
                    Spending Pace
                  </span>
                  <span
                    className="text-sm font-bold font-mono block mt-0.5"
                    style={{ color: isOverDailySafeLimit ? 'var(--ff-danger)' : 'var(--ff-success)' }}
                  >
                    {isOverDailySafeLimit ? 'Burning Fast' : 'Within Guardrail'}
                  </span>
                  <span className="text-[10px] text-[var(--ff-text-muted)] mt-0.5 block">
                    {budgetPct >= 100
                      ? '100% budget consumed'
                      : `${100 - budgetPct}% remaining runway`}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            <form onSubmit={handleSaveMonthlyBudget} className="ff-surface-subtle p-3.5 space-y-2.5">
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block">
                Overall Monthly Budget Limit (₹)
              </label>
              <div className="flex gap-2">
                <ThemeInput
                  type="number"
                  min="0"
                  step="100"
                  value={monthlyBudgetInput}
                  onChange={(e) => setMonthlyBudgetInput(e.target.value)}
                />
                <ThemeButton type="submit" variant="primary" size="sm">
                  Save Cap
                </ThemeButton>
              </div>
            </form>

            <form onSubmit={handleSaveCategoryBudget} className="ff-surface-subtle p-3.5 space-y-2.5">
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block">
                Set Category Budget Cap (0 to clear)
              </label>
              <div className="flex flex-wrap gap-2">
                <ThemeSelect
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className="flex-1 min-w-[140px]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </ThemeSelect>
                <ThemeInput
                  type="number"
                  min="0"
                  step="100"
                  placeholder="₹ Limit"
                  value={catBudgetInput}
                  onChange={(e) => setCatBudgetInput(e.target.value)}
                  className="w-28"
                />
                <ThemeButton type="submit" variant="secondary" size="sm">
                  Apply
                </ThemeButton>
              </div>
            </form>
          </div>

          {/* Configured Category Budgets Breakdown */}
          {Object.keys(settings?.categoryBudgets || {}).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(settings?.categoryBudgets || {}).map(([catId, capPaise]) => {
                const cat = categories.find((c) => c.id === catId);
                const spent =
                  summary?.categoryBreakdown.find((b) => b.categoryId === catId || b.name === cat?.name)
                    ?.amountPaise || 0;
                const pct = capPaise > 0 ? Math.round((spent / capPaise) * 100) : 0;
                return (
                  <div key={catId} className="ff-surface-subtle p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[var(--ff-text-primary)] truncate">
                        {cat?.name || catId}
                      </span>
                      <span
                        className="font-mono font-bold"
                        style={{
                          color:
                            pct >= 100
                              ? 'var(--ff-danger)'
                              : pct >= warnThreshold
                                ? 'var(--ff-warning)'
                                : 'var(--ff-success)',
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--ff-text-muted)]">
                      {formatCurrency(spent, currency)} / {formatCurrency(capPaise, currency)}
                    </div>
                    <AnimatedProgressBar
                      value={pct}
                      tone={
                        pct >= 100
                          ? 'danger'
                          : pct >= warnThreshold
                            ? 'warning'
                            : 'accent'
                      }
                      pulsing={pct >= 85}
                      heightClass="h-1.5"
                      ariaLabel={`${cat?.name || catId} budget utilization`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </ThemeCard>
      )}

      {showSavings && (
        <ThemeCard className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-[var(--ff-success)]" />
                Savings Goals &amp; Reserves
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Track emergency funds, hardware reserves, or investment targets cleanly
              </p>
            </div>
            <ThemeBadge tone="success">{goals.length} Goals</ThemeBadge>
          </div>

          <form
            onSubmit={handleCreateGoal}
            className="ff-surface-subtle p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
          >
            <div className="sm:col-span-5">
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Goal Name
              </label>
              <ThemeInput
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="e.g., 6-Month Runway Fund"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Target (₹)
              </label>
              <ThemeInput
                type="number"
                min="1"
                value={goalTargetInput}
                onChange={(e) => setGoalTargetInput(e.target.value)}
                placeholder="100000"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Target Date
              </label>
              <ThemeInput
                type="date"
                value={goalDate}
                onChange={(e) => setGoalDate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <ThemeButton type="submit" variant="primary" size="sm" className="w-full">
                <Plus className="w-3.5 h-3.5" /> Add Goal
              </ThemeButton>
            </div>
          </form>

          {goals.length === 0 ? (
            <EmptyStateIllustration
              icon={<PiggyBank className="w-6 h-6" />}
              title="No active savings goals"
              description="Define a target for emergency fund, equipment, or investments above to track your progress visually."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map((g) => {
                const pct =
                  g.targetPaise > 0
                    ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100))
                    : 0;
                return (
                  <div key={g.id} className="ff-surface-subtle p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">{g.title}</h4>
                        <p className="text-[11px] text-[var(--ff-text-muted)]">
                          {formatCurrency(g.savedPaise, currency)} of{' '}
                          {formatCurrency(g.targetPaise, currency)} ({pct}%)
                          {g.targetDate ? ` · Due ${g.targetDate}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteGoal(g)}
                        className="p-1.5 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                        aria-label={`Delete ${g.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <AnimatedProgressBar
                      value={pct}
                      tone={pct >= 100 ? 'success' : 'accent'}
                      showShimmer={pct >= 100}
                      heightClass="h-2"
                      ariaLabel={`${g.title} savings progress`}
                    />

                    <div className="flex items-center gap-2">
                      <ThemeInput
                        type="number"
                        min="1"
                        placeholder="₹ 1000"
                        value={contribAmounts[g.id] ?? ''}
                        onChange={(e) =>
                          setContribAmounts((prev) => ({ ...prev, [g.id]: e.target.value }))
                        }
                        className="flex-1 text-xs py-1.5"
                      />
                      <ThemeButton
                        variant="success"
                        size="xs"
                        onClick={() => void handleAdjustGoal(g, 1)}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" /> Deposit
                      </ThemeButton>
                      <ThemeButton
                        variant="secondary"
                        size="xs"
                        onClick={() => void handleAdjustGoal(g, -1)}
                      >
                        <ArrowDownRight className="w-3.5 h-3.5" /> Withdraw
                      </ThemeButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ThemeCard>
      )}
    </div>
  );
};
