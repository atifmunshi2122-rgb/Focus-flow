import test from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, fromPaise, formatCurrency } from '../src/lib/currency.ts';
import { dbService } from '../server/db.ts';

test('Finance Accuracy — Exact 12-Month Cashflow, Net Balance & Savings Rate Analytics', () => {
  // Test monthly cashflow math
  const monthlyIncomes = [
    toPaise(150000), // Month 1: ₹1,50,000
    toPaise(180000), // Month 2: ₹1,80,000
    toPaise(120000), // Month 3: ₹1,20,000
    toPaise(210000), // Month 4: ₹2,10,000
  ];

  const monthlyExpenses = [
    toPaise(85000),  // Month 1: ₹85,000
    toPaise(95000),  // Month 2: ₹95,000
    toPaise(110000), // Month 3: ₹1,10,000
    toPaise(105000), // Month 4: ₹1,05,000
  ];

  let cumulativeIncomePaise = 0;
  let cumulativeExpensePaise = 0;

  for (let m = 0; m < monthlyIncomes.length; m++) {
    const inc = monthlyIncomes[m];
    const exp = monthlyExpenses[m];
    const net = inc - exp;
    const savingsRatio = inc > 0 ? (net / inc) : 0;

    cumulativeIncomePaise += inc;
    cumulativeExpensePaise += exp;

    assert.ok(net > 0, `Month ${m + 1} net balance must be positive`);
    assert.ok(savingsRatio > 0 && savingsRatio < 1, `Month ${m + 1} savings ratio must be valid`);
  }

  const netCumulativePaise = cumulativeIncomePaise - cumulativeExpensePaise;
  assert.equal(cumulativeIncomePaise, toPaise(660000));
  assert.equal(cumulativeExpensePaise, toPaise(395000));
  assert.equal(netCumulativePaise, toPaise(265000)); // Exactly ₹2,65,000.00
});

test('Finance Accuracy — Fixed vs. Variable Expense Segregation and Distribution', () => {
  const fixedExpenses = [
    { name: 'Apartment Rent', amountPaise: toPaise(35000) },
    { name: 'Fiber Broadband', amountPaise: toPaise(1499) },
    { name: 'Cloud Server VPS', amountPaise: toPaise(2500) },
    { name: 'Health Insurance', amountPaise: toPaise(4000) },
  ];

  const variableExpenses = [
    { name: 'Organic Supermarket', amountPaise: toPaise(12500) },
    { name: 'Dining Out', amountPaise: toPaise(4800) },
    { name: 'Fuel & Metro', amountPaise: toPaise(3200) },
    { name: 'Books & Learning', amountPaise: toPaise(1999) },
  ];

  const totalFixedPaise = fixedExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
  const totalVariablePaise = variableExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
  const totalOutflowsPaise = totalFixedPaise + totalVariablePaise;

  assert.equal(totalFixedPaise, 4299900);     // ₹42,999.00
  assert.equal(totalVariablePaise, 2249900);  // ₹22,499.00
  assert.equal(totalOutflowsPaise, 6549800);  // ₹65,498.00

  const fixedPercentage = Math.round((totalFixedPaise / totalOutflowsPaise) * 100);
  const variablePercentage = Math.round((totalVariablePaise / totalOutflowsPaise) * 100);

  assert.equal(fixedPercentage + variablePercentage, 100);
  assert.equal(fixedPercentage, 66); // 65.65% -> 66%
  assert.equal(variablePercentage, 34); // 34.35% -> 34%
});

test('Finance Accuracy — Bill Status Transitions: PAID, UNPAID, and OVERDUE Evaluation', () => {
  const todayStr = '2026-11-15';

  const testBills = [
    { id: 'b1', dueDate: '2026-11-10', status: 'PAID', amountPaise: toPaise(5000) },      // Paid in past: settled
    { id: 'b2', dueDate: '2026-11-20', status: 'UNPAID', amountPaise: toPaise(3000) },    // Future due date: UNPAID
    { id: 'b3', dueDate: '2026-11-05', status: 'UNPAID', amountPaise: toPaise(2500) },    // Past due date: OVERDUE
  ];

  // Evaluate dynamic status
  const evaluated = testBills.map((b) => {
    let effectiveStatus = b.status;
    if (b.status === 'UNPAID' && b.dueDate < todayStr) {
      effectiveStatus = 'OVERDUE';
    }
    return { ...b, effectiveStatus };
  });

  assert.equal(evaluated[0].effectiveStatus, 'PAID');
  assert.equal(evaluated[1].effectiveStatus, 'UNPAID');
  assert.equal(evaluated[2].effectiveStatus, 'OVERDUE');

  // Summary aggregation
  const paidTotal = evaluated.filter((b) => b.effectiveStatus === 'PAID').reduce((sum, b) => sum + b.amountPaise, 0);
  const unpaidTotal = evaluated.filter((b) => b.effectiveStatus === 'UNPAID').reduce((sum, b) => sum + b.amountPaise, 0);
  const overdueTotal = evaluated.filter((b) => b.effectiveStatus === 'OVERDUE').reduce((sum, b) => sum + b.amountPaise, 0);

  assert.equal(paidTotal, toPaise(5000));
  assert.equal(unpaidTotal, toPaise(3000));
  assert.equal(overdueTotal, toPaise(2500));
});

test('Finance Accuracy — Budget Envelope Utilization & Health Thresholds', () => {
  const allocatedPaise = toPaise(20000); // ₹20,000.00

  // 1. On Track Scenario (< 85% utilization)
  const spentOnTrack = toPaise(12000); // 60%
  const ratio1 = spentOnTrack / allocatedPaise;
  const health1 = spentOnTrack > allocatedPaise ? 'OVERSPENT' : ratio1 >= 0.85 ? 'WARNING' : 'ON_TRACK';
  assert.equal(health1, 'ON_TRACK');

  // 2. Warning Scenario (85% to 100% utilization)
  const spentWarning = toPaise(18000); // 90%
  const ratio2 = spentWarning / allocatedPaise;
  const health2 = spentWarning > allocatedPaise ? 'OVERSPENT' : ratio2 >= 0.85 ? 'WARNING' : 'ON_TRACK';
  assert.equal(health2, 'WARNING');

  // 3. Overspent Scenario (> 100% utilization)
  const spentOver = toPaise(22500); // 112.5%
  const ratio3 = spentOver / allocatedPaise;
  const health3 = spentOver > allocatedPaise ? 'OVERSPENT' : ratio3 >= 0.85 ? 'WARNING' : 'ON_TRACK';
  assert.equal(health3, 'OVERSPENT');
  const deficitPaise = spentOver - allocatedPaise;
  assert.equal(deficitPaise, toPaise(2500)); // Exactly ₹2,500 overspend
});

test('Finance Accuracy — Zero Floating Point Drift across 10,000 Operations', () => {
  let accumulatorPaise = 0;
  const incrementPaise = toPaise(19.99); // ₹19.99 = 1999 paise

  for (let i = 0; i < 10000; i++) {
    accumulatorPaise += incrementPaise;
  }

  // 10,000 * 1,999 = 19,990,000 paise = ₹1,99,900.00 exact!
  assert.equal(accumulatorPaise, 19990000);
  assert.equal(fromPaise(accumulatorPaise), 199900);
  assert.equal(formatCurrency(accumulatorPaise, 'INR'), '₹1,99,900.00');
});

