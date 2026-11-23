import { InflationGoalCalculation } from '../types/features15.ts';

/**
 * Calculates nominal future value, inflation erosion, and required monthly compounding savings.
 *
 * @param currentAmount - Present Value (PV) of the goal in current currency
 * @param years - Horizon in years
 * @param annualInflationRate - Expected annual inflation rate (in %, e.g. 6 for 6%)
 * @param expectedReturnRate - Expected annualized investment return rate (in %, e.g. 10 for 10%)
 */
export function calculateInflationAdjustedGoal(
  currentAmount: number,
  years: number,
  annualInflationRate: number = 6,
  expectedReturnRate: number = 10
): InflationGoalCalculation {
  const pv = Math.max(0, currentAmount);
  const n = Math.max(1, years);
  const r = annualInflationRate / 100;
  const R = expectedReturnRate / 100;

  // FV = PV * (1 + r)^n
  const futureNominalTarget = Math.round(pv * Math.pow(1 + r, n));

  // Purchasing power loss factor: (1 / (1 + r)^n)
  const purchasingPowerLossFactor = Math.pow(1 + r, -n);

  // Monthly compounding SIP formula:
  // PMT = FV * i / ((1 + i)^m - 1), where i = R / 12, m = n * 12
  const m = n * 12;
  const i = R / 12;

  let requiredMonthlySavings = 0;
  if (i > 0) {
    const denominator = Math.pow(1 + i, m) - 1;
    requiredMonthlySavings = denominator > 0 ? Math.round((futureNominalTarget * i) / denominator) : Math.round(futureNominalTarget / m);
  } else {
    requiredMonthlySavings = Math.round(futureNominalTarget / m);
  }

  // Sensitivity analysis scenarios
  const scenarioRates = [
    Math.max(1, annualInflationRate - 2),
    annualInflationRate,
    annualInflationRate + 2,
    annualInflationRate + 4,
  ];

  const scenarios = scenarioRates.map((infRate) => {
    const inf = infRate / 100;
    const fCost = Math.round(pv * Math.pow(1 + inf, n));
    let mSavings = 0;
    if (i > 0) {
      const denom = Math.pow(1 + i, m) - 1;
      mSavings = denom > 0 ? Math.round((fCost * i) / denom) : Math.round(fCost / m);
    } else {
      mSavings = Math.round(fCost / m);
    }

    return {
      inflationRate: infRate,
      futureCost: fCost,
      monthlySavingsRequired: mSavings,
    };
  });

  return {
    currentAmount: pv,
    years: n,
    annualInflationRate,
    futureNominalTarget,
    purchasingPowerLossFactor: Math.round(purchasingPowerLossFactor * 1000) / 1000,
    expectedReturnRate,
    requiredMonthlySavings,
    scenarios,
  };
}

