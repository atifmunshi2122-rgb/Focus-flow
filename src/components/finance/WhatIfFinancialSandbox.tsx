import React, { useState, useMemo } from 'react';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Sliders,
  TrendingUp,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Percent,
} from 'lucide-react';

interface WhatIfCategoryDelta {
  key: string;
  name: string;
  baselinePaise: number;
  deltaPercent: number; // -100 to +100%
}

export const WhatIfFinancialSandbox: React.FC = () => {
  // Baseline defaults (can be calibrated from real summary if available)
  const baselineMonthlyIncomePaise = 10000000; // ₹1,00,000 / month
  const [incomeDeltaPercent, setIncomeDeltaPercent] = useState<number>(0);

  const [categories, setCategories] = useState<WhatIfCategoryDelta[]>([
    { key: 'rent', name: 'Housing & Rent', baselinePaise: 2500000, deltaPercent: 0 },
    { key: 'groceries', name: 'Groceries & Household', baselinePaise: 1500000, deltaPercent: 0 },
    { key: 'dining', name: 'Dining Out & Food Delivery', baselinePaise: 1000000, deltaPercent: 0 },
    { key: 'subscriptions', name: 'Subscriptions & Memberships', baselinePaise: 300000, deltaPercent: 0 },
    { key: 'shopping', name: 'Discretionary Shopping & Gadgets', baselinePaise: 1200000, deltaPercent: 0 },
    { key: 'transit', name: 'Commute & Transportation', baselinePaise: 500000, deltaPercent: 0 },
  ]);

  const handleCategoryDeltaChange = (key: string, deltaPercent: number) => {
    setCategories((prev) =>
      prev.map((c) => (c.key === key ? { ...c, deltaPercent } : c))
    );
  };

  const handleReset = () => {
    setIncomeDeltaPercent(0);
    setCategories((prev) => prev.map((c) => ({ ...c, deltaPercent: 0 })));
  };

  // Calculations
  const simulation = useMemo(() => {
    const baselineExpensesPaise = categories.reduce((acc, c) => acc + c.baselinePaise, 0);
    const baselineMonthlySavingsPaise = baselineMonthlyIncomePaise - baselineExpensesPaise;
    const baselineSavingsRate = Math.round((baselineMonthlySavingsPaise / baselineMonthlyIncomePaise) * 100);

    // Simulated values
    const simulatedIncomePaise = Math.round(baselineMonthlyIncomePaise * (1 + incomeDeltaPercent / 100));
    const simulatedExpensesPaise = categories.reduce((acc, c) => {
      const adjusted = Math.max(0, Math.round(c.baselinePaise * (1 + c.deltaPercent / 100)));
      return acc + adjusted;
    }, 0);

    const simulatedMonthlySavingsPaise = simulatedIncomePaise - simulatedExpensesPaise;
    const simulatedSavingsRate = simulatedIncomePaise > 0
      ? Math.round((simulatedMonthlySavingsPaise / simulatedIncomePaise) * 100)
      : 0;

    const monthlyDeltaPaise = simulatedMonthlySavingsPaise - baselineMonthlySavingsPaise;
    const annualDeltaPaise = monthlyDeltaPaise * 12;

    // 5-Year compounding at 10% annual return: FV of annuity
    // FV = PMT * ((1+i)^m - 1) / i
    const monthlyRate = 0.10 / 12;
    const months = 60;
    const fiveYearCompoundDeltaPaise =
      monthlyDeltaPaise > 0
        ? Math.round((monthlyDeltaPaise * (Math.pow(1 + monthlyRate, months) - 1)) / monthlyRate)
        : annualDeltaPaise * 5;

    return {
      baselineExpensesPaise,
      baselineMonthlySavingsPaise,
      baselineSavingsRate,
      simulatedIncomePaise,
      simulatedExpensesPaise,
      simulatedMonthlySavingsPaise,
      simulatedSavingsRate,
      monthlyDeltaPaise,
      annualDeltaPaise,
      fiveYearCompoundDeltaPaise,
    };
  }, [incomeDeltaPercent, categories]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Sliders className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">What-If Financial Sandbox</h2>
            <ThemeBadge tone="accent">Non-Destructive</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Explore "what-if" spending cuts, career raises, or expense expansions. Your real database transactions remain 100% untouched.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sandbox Mode Active</span>
          </div>

          <ThemeButton variant="ghost" size="sm" onClick={handleReset} title="Reset all sliders">
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset Baseline
          </ThemeButton>
        </div>
      </div>

      {/* Comparison Cockpit Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-1">
          <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider font-bold">
            Simulated Monthly Savings
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ₹ {(simulation.simulatedMonthlySavingsPaise / 100).toLocaleString()}
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)] font-mono">
            Baseline: ₹ {(simulation.baselineMonthlySavingsPaise / 100).toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-1">
          <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider font-bold">
            Monthly Savings Delta
          </span>
          <div
            className={`text-2xl font-bold font-mono ${
              simulation.monthlyDeltaPaise >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {simulation.monthlyDeltaPaise >= 0 ? '+' : ''}₹{' '}
            {(simulation.monthlyDeltaPaise / 100).toLocaleString()}
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)] font-mono">
            Savings Rate: {simulation.simulatedSavingsRate}% (was {simulation.baselineSavingsRate}%)
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-1">
          <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider font-bold">
            1-Year Capital Impact
          </span>
          <div
            className={`text-2xl font-bold font-mono ${
              simulation.annualDeltaPaise >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {simulation.annualDeltaPaise >= 0 ? '+' : ''}₹{' '}
            {(simulation.annualDeltaPaise / 100).toLocaleString()}
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">Net annual surplus change</span>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-surface)] border border-sky-500/30 space-y-1">
          <span className="text-[10px] text-sky-400 uppercase tracking-wider font-bold">
            5-Year Wealth Compounding
          </span>
          <div
            className={`text-2xl font-bold font-mono ${
              simulation.fiveYearCompoundDeltaPaise >= 0 ? 'text-sky-300' : 'text-rose-400'
            }`}
          >
            {simulation.fiveYearCompoundDeltaPaise >= 0 ? '+' : ''}₹{' '}
            {(simulation.fiveYearCompoundDeltaPaise / 100).toLocaleString()}
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">Invested at 10% CAGR</span>
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Income Slider */}
        <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider">
              Monthly Income Adjustment
            </span>
            <span
              className={`text-xs font-mono font-bold ${
                incomeDeltaPercent > 0
                  ? 'text-emerald-400'
                  : incomeDeltaPercent < 0
                  ? 'text-rose-400'
                  : 'text-[var(--ff-text-muted)]'
              }`}
            >
              {incomeDeltaPercent > 0 ? `+${incomeDeltaPercent}%` : `${incomeDeltaPercent}%`}
            </span>
          </div>

          <input
            type="range"
            min="-50"
            max="100"
            step="5"
            value={incomeDeltaPercent}
            onChange={(e) => setIncomeDeltaPercent(parseInt(e.target.value, 10))}
            className="w-full accent-emerald-500"
          />

          <div className="flex justify-between text-xs text-[var(--ff-text-muted)] font-mono">
            <span>-50% Pay Cut</span>
            <span className="text-[var(--ff-text-primary)] font-bold">
              ₹ {(simulation.simulatedIncomePaise / 100).toLocaleString()} / mo
            </span>
            <span>+100% 2x Promotion</span>
          </div>
        </div>

        {/* Expense Categories Sliders */}
        <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider">
              Expense Category Variations
            </span>
            <span className="text-xs text-[var(--ff-text-muted)]">
              Negative = Cut Spending • Positive = Lifestyle Creep
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {categories.map((cat) => {
              const adjustedPaise = Math.round(cat.baselinePaise * (1 + cat.deltaPercent / 100));

              return (
                <div key={cat.key} className="p-3.5 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[var(--ff-text-primary)]">{cat.name}</span>
                    <span
                      className={`font-mono font-bold ${
                        cat.deltaPercent < 0
                          ? 'text-emerald-400'
                          : cat.deltaPercent > 0
                          ? 'text-rose-400'
                          : 'text-[var(--ff-text-muted)]'
                      }`}
                    >
                      {cat.deltaPercent > 0 ? `+${cat.deltaPercent}%` : `${cat.deltaPercent}%`}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="-80"
                    max="100"
                    step="5"
                    value={cat.deltaPercent}
                    onChange={(e) => handleCategoryDeltaChange(cat.key, parseInt(e.target.value, 10))}
                    className={`w-full ${cat.deltaPercent < 0 ? 'accent-emerald-500' : 'accent-rose-500'}`}
                  />

                  <div className="flex justify-between text-[11px] text-[var(--ff-text-muted)] font-mono">
                    <span>Baseline: ₹ {(cat.baselinePaise / 100).toLocaleString()}</span>
                    <span className="font-bold text-[var(--ff-text-primary)]">
                      Simulated: ₹ {(adjustedPaise / 100).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

