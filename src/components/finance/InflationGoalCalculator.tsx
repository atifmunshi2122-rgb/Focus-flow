import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { CURRENCY_SYMBOLS } from '../../lib/currency.ts';
import { calculateInflationAdjustedGoal } from '../../lib/inflationCalculator.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  TrendingUp,
  Percent,
  Calendar,
  AlertTriangle,
  HelpCircle,
  PiggyBank,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const InflationGoalCalculator: React.FC = () => {
  const { settings } = useApp();
  const currency = settings?.currency || 'INR';
  const symbol = CURRENCY_SYMBOLS[currency] || '₹';

  const [targetCostInput, setTargetCostInput] = useState<string>('2000000');
  const targetCostPV = useMemo(() => {
    const parsed = parseInt(targetCostInput, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [targetCostInput]);
  const [horizonYears, setHorizonYears] = useState<number>(10);
  const [inflationRate, setInflationRate] = useState<number>(6.5); // 6.5% typical developing economy
  const [returnRate, setReturnRate] = useState<number>(11.5); // 11.5% broad market index return

  const calc = useMemo(() => {
    return calculateInflationAdjustedGoal(Math.max(1000, targetCostPV || 1000), horizonYears, inflationRate, returnRate);
  }, [targetCostPV, horizonYears, inflationRate, returnRate]);

  const inflationErosionAmount = calc.futureNominalTarget - calc.currentAmount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">Inflation-Adjusted Goal Calculator</h2>
            <ThemeBadge tone="warning">Mathematical Truth</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            A goal of ₹20L today will cost dramatically more in 10 years due to monetary debasement. Calculate true future costs and required monthly SIP.
          </p>
        </div>
      </div>

      {/* Main Calculation Inputs & Result Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Inputs Card */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
          <h3 className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider">
            Goal Target & Inflation Assumptions
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-medium text-[var(--ff-text-muted)] block mb-1">
                Goal Cost in Today’s Money (PV)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-[var(--ff-text-muted)] font-mono font-bold">{symbol}</span>
                <input
                  type="number"
                  min="1000"
                  step="50000"
                  value={targetCostInput}
                  onChange={(e) => setTargetCostInput(e.target.value)}
                  onBlur={() => {
                    const num = parseInt(targetCostInput, 10);
                    if (!Number.isFinite(num) || num < 1000) {
                      setTargetCostInput('1000');
                    }
                  }}
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-medium text-[var(--ff-text-muted)]">Time Horizon</label>
                <span className="font-bold text-[var(--ff-text-primary)] font-mono">{horizonYears} Years</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={horizonYears}
                onChange={(e) => setHorizonYears(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--ff-accent)]"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-medium text-[var(--ff-text-muted)]">Expected Annual Inflation Rate</label>
                <span className="font-bold text-amber-400 font-mono">{inflationRate}%</span>
              </div>
              <input
                type="range"
                min="2"
                max="15"
                step="0.5"
                value={inflationRate}
                onChange={(e) => setInflationRate(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-medium text-[var(--ff-text-muted)]">Expected Investment Return (CAGR)</label>
                <span className="font-bold text-emerald-400 font-mono">{returnRate}%</span>
              </div>
              <input
                type="range"
                min="4"
                max="18"
                step="0.5"
                value={returnRate}
                onChange={(e) => setReturnRate(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[11px] text-[var(--ff-text-muted)] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Real Return Spread: <strong>{(returnRate - inflationRate).toFixed(1)}%</strong> above inflation.
            </span>
          </div>
        </div>

        {/* Right Output Dashboard Cards */}
        <div className="lg:col-span-7 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Future Cost Card */}
            <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-amber-500/30 space-y-2">
              <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                Future Nominal Cost ({horizonYears}y)
              </span>
              <div className="text-3xl font-extrabold font-mono text-[var(--ff-text-primary)]">
                {symbol} {calc.futureNominalTarget.toLocaleString()}
              </div>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Cost increases by{' '}
                <strong className="text-rose-400">+{symbol} {inflationErosionAmount.toLocaleString()}</strong> due to inflation.
              </p>
            </div>

            {/* Required Monthly SIP Card */}
            <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-emerald-500/30 space-y-2">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                Required Monthly Compounding SIP
              </span>
              <div className="text-3xl font-extrabold font-mono text-emerald-400">
                {symbol} {calc.requiredMonthlySavings.toLocaleString()}
                <span className="text-xs font-normal text-[var(--ff-text-muted)]"> / mo</span>
              </div>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Assumes compounding monthly investment at {returnRate}% CAGR.
              </p>
            </div>
          </div>

          {/* Purchasing Power Erosion Visual */}
          <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-3">
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Currency Purchasing Power Erosion</span>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-[var(--ff-text-muted)]">
                <span>Value of {symbol}100 Today</span>
                <span className="font-bold text-[var(--ff-text-primary)]">
                  {symbol} {Math.round(100 * calc.purchasingPowerLossFactor)} in {horizonYears} Years
                </span>
              </div>
              <div className="w-full bg-[var(--ff-surface-muted)] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-rose-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(calc.purchasingPowerLossFactor * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--ff-text-muted)]">
                Money in cash loses {Math.round((1 - calc.purchasingPowerLossFactor) * 100)}% of its purchasing utility over {horizonYears} years.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sensitivity Scenarios Matrix */}
      <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-3">
        <h3 className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider">
          Inflation Sensitivity Scenarios
        </h3>
        <p className="text-xs text-[var(--ff-text-muted)]">
          Compare required monthly savings if inflation fluctuates higher or lower over your {horizonYears}-year window.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--ff-border)] text-[var(--ff-text-muted)]">
                <th className="py-2.5 px-3">Inflation Scenario</th>
                <th className="py-2.5 px-3">Annual Rate</th>
                <th className="py-2.5 px-3">Projected Future Cost</th>
                <th className="py-2.5 px-3">Required Monthly Investment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ff-border)]">
              {calc.scenarios.map((sc, idx) => (
                <tr key={idx} className="text-[var(--ff-text-primary)]">
                  <td className="py-3 px-3 font-medium">
                    {idx === 0
                      ? 'Optimistic (Low Inflation)'
                      : idx === 1
                      ? 'Base Case (Expected)'
                      : idx === 2
                      ? 'Adverse (High Inflation)'
                      : 'Severe Stagflation'}
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-amber-400">{sc.inflationRate}%</td>
                  <td className="py-3 px-3 font-mono">{symbol} {sc.futureCost.toLocaleString()}</td>
                  <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                    {symbol} {sc.monthlySavingsRequired.toLocaleString()} / mo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mathematical Formulas Card */}
      <div className="p-4 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-muted)] space-y-1">
        <span className="font-bold text-[var(--ff-text-primary)] block">Financial Mathematics Used:</span>
        <div>Future Value: <code>FV = PV × (1 + r)ⁿ</code></div>
        <div>
          Monthly Compounding Annuity (Sinking Fund): <code>PMT = (FV × i) / ((1 + i)ᵐ - 1)</code>, where <code>i = Return / 12</code>, <code>m = Years × 12</code>.
        </div>
      </div>
    </div>
  );
};

