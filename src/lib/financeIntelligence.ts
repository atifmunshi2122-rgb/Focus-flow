import type {
  ExpenseTransaction,
  IncomeTransaction,
  UserSettings,
} from '../types/index.ts';

export interface CategoryComparison {
  name: string;
  thisMonthPaise: number;
  lastMonthPaise: number;
  deltaPaise: number;
  pctChange: number;
}

export interface SpendingInsightsResult {
  thisMonthExpensesPaise: number;
  lastMonthExpensesPaise: number;
  monthOverMonthPctChange: number;
  isMonthOverMonthIncrease: boolean;
  
  topCategory: {
    name: string;
    amountPaise: number;
    pctShare: number;
  } | null;

  highestWeekday: {
    dayName: string;
    amountPaise: number;
    pctShare: number;
  } | null;

  highestSpendingDay: {
    date: string;
    amountPaise: number;
  } | null;

  lowestSpendingDay: {
    date: string;
    amountPaise: number;
  } | null;

  avgDailySpendPaise: number;
  activeSpendingDaysCount: number;

  increasingCategories: CategoryComparison[];

  todaySpending: {
    date: string;
    totalPaise: number;
    transactionCount: number;
    limitPaise: number;
    remainingPaise: number;
    isOverLimit: boolean;
    vsYesterdayPaise: number;
    yesterdayPaise: number;
  };

  weeklySpending: {
    totalPaise: number;
    transactionCount: number;
    limitPaise: number;
    remainingPaise: number;
    isOverLimit: boolean;
  };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function computeSpendingInsights(input: {
  expenses: ExpenseTransaction[];
  incomes?: IncomeTransaction[];
  settings?: UserSettings | null;
  todayStr?: string;
}): SpendingInsightsResult {
  const { expenses, settings } = input;
  const now = new Date();
  const todayStr = input.todayStr || now.toISOString().slice(0, 10);
  const baseDate = new Date(`${todayStr}T12:00:00Z`);
  const currentMonthKey = todayStr.slice(0, 7);

  // Calculate previous month key
  const [currY, currM] = currentMonthKey.split('-').map(Number);
  const prevMonthDate = new Date(currY, currM - 2, 1);
  const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Filter active (non-deleted) expenses
  const activeExpenses = expenses.filter((e) => !e.deletedAt);

  // Current month & previous month expenses
  const thisMonthExpenses = activeExpenses.filter((e) => e.date.startsWith(currentMonthKey));
  const lastMonthExpenses = activeExpenses.filter((e) => e.date.startsWith(prevMonthKey));

  const thisMonthExpensesPaise = thisMonthExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
  const lastMonthExpensesPaise = lastMonthExpenses.reduce((sum, e) => sum + e.amountPaise, 0);

  let monthOverMonthPctChange = 0;
  if (lastMonthExpensesPaise > 0) {
    monthOverMonthPctChange = Math.round(
      ((thisMonthExpensesPaise - lastMonthExpensesPaise) / lastMonthExpensesPaise) * 100
    );
  }

  // Category breakdown for this month
  const categoryTotals: Record<string, number> = {};
  for (const exp of thisMonthExpenses) {
    const catName = exp.categoryName || exp.categoryId || 'General';
    categoryTotals[catName] = (categoryTotals[catName] || 0) + exp.amountPaise;
  }

  let topCategory: SpendingInsightsResult['topCategory'] = null;
  const catEntries = Object.entries(categoryTotals);
  if (catEntries.length > 0) {
    catEntries.sort((a, b) => b[1] - a[1]);
    const [topName, topAmount] = catEntries[0];
    const pct = thisMonthExpensesPaise > 0 ? Math.round((topAmount / thisMonthExpensesPaise) * 100) : 0;
    topCategory = { name: topName, amountPaise: topAmount, pctShare: pct };
  }

  // Category breakdown for previous month to detect growth
  const prevCategoryTotals: Record<string, number> = {};
  for (const exp of lastMonthExpenses) {
    const catName = exp.categoryName || exp.categoryId || 'General';
    prevCategoryTotals[catName] = (prevCategoryTotals[catName] || 0) + exp.amountPaise;
  }

  const increasingCategories: CategoryComparison[] = [];
  for (const [catName, thisPaise] of Object.entries(categoryTotals)) {
    const lastPaise = prevCategoryTotals[catName] || 0;
    if (thisPaise > lastPaise && lastPaise > 0) {
      const delta = thisPaise - lastPaise;
      const pct = Math.round((delta / lastPaise) * 100);
      increasingCategories.push({
        name: catName,
        thisMonthPaise: thisPaise,
        lastMonthPaise: lastPaise,
        deltaPaise: delta,
        pctChange: pct,
      });
    }
  }
  increasingCategories.sort((a, b) => b.deltaPaise - a.deltaPaise);

  // Weekday distribution (this month)
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  for (const exp of thisMonthExpenses) {
    const d = new Date(exp.date + 'T00:00:00');
    const dayOfWeek = d.getDay();
    weekdayTotals[dayOfWeek] += exp.amountPaise;
  }

  let highestWeekday: SpendingInsightsResult['highestWeekday'] = null;
  let maxDaySpend = -1;
  let maxDayIdx = -1;
  for (let i = 0; i < 7; i++) {
    if (weekdayTotals[i] > maxDaySpend) {
      maxDaySpend = weekdayTotals[i];
      maxDayIdx = i;
    }
  }
  if (maxDaySpend > 0 && maxDayIdx >= 0) {
    const pct = thisMonthExpensesPaise > 0 ? Math.round((maxDaySpend / thisMonthExpensesPaise) * 100) : 0;
    highestWeekday = {
      dayName: WEEKDAY_NAMES[maxDayIdx],
      amountPaise: maxDaySpend,
      pctShare: pct,
    };
  }

  // Day-by-day totals in current month
  const dayTotals: Record<string, number> = {};
  for (const exp of thisMonthExpenses) {
    dayTotals[exp.date] = (dayTotals[exp.date] || 0) + exp.amountPaise;
  }
  const dayEntries = Object.entries(dayTotals);
  dayEntries.sort((a, b) => b[1] - a[1]);

  const highestSpendingDay = dayEntries.length > 0 ? { date: dayEntries[0][0], amountPaise: dayEntries[0][1] } : null;
  const lowestSpendingDay = dayEntries.length > 0 ? { date: dayEntries[dayEntries.length - 1][0], amountPaise: dayEntries[dayEntries.length - 1][1] } : null;

  const activeDays = dayEntries.length;
  const avgDailySpendPaise = activeDays > 0 ? Math.round(thisMonthExpensesPaise / activeDays) : 0;

  // Today & Yesterday calculation
  const yesterday = new Date(baseDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const todayExpenses = activeExpenses.filter((e) => e.date === todayStr);
  const yesterdayExpenses = activeExpenses.filter((e) => e.date === yesterdayStr);

  const todayPaise = todayExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const yesterdayPaise = yesterdayExpenses.reduce((s, e) => s + e.amountPaise, 0);

  // Daily limit
  const daysInMonth = new Date(currY, currM, 0).getDate();
  const currentDayNum = Number(todayStr.slice(8, 10)) || 1;
  const daysRemaining = Math.max(1, daysInMonth - currentDayNum + 1);
  const monthlyCap = settings?.monthlyBudgetPaise || 0;
  const remainingMonthlyPaise = Math.max(0, monthlyCap - thisMonthExpensesPaise);
  
  const configuredDailyLimit = settings?.dailySpendingLimitPaise || 0;
  const effectiveDailyLimit =
    configuredDailyLimit > 0
      ? configuredDailyLimit
      : monthlyCap > 0
        ? Math.round(remainingMonthlyPaise / daysRemaining)
        : 0;

  const isOverDailyLimit = effectiveDailyLimit > 0 && todayPaise > effectiveDailyLimit;
  const remainingDailyPaise = Math.max(0, effectiveDailyLimit - todayPaise);

  // Current week calculation (last 7 days)
  const sevenDaysAgo = new Date(baseDate);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const weekExpenses = activeExpenses.filter((e) => e.date >= sevenDaysAgoStr && e.date <= todayStr);
  const weekPaise = weekExpenses.reduce((s, e) => s + e.amountPaise, 0);

  const configuredWeeklyLimit = settings?.weeklySpendingLimitPaise || 0;
  const effectiveWeeklyLimit =
    configuredWeeklyLimit > 0
      ? configuredWeeklyLimit
      : monthlyCap > 0
        ? Math.round(monthlyCap / 4)
        : 0;

  const isOverWeeklyLimit = effectiveWeeklyLimit > 0 && weekPaise > effectiveWeeklyLimit;
  const remainingWeeklyPaise = Math.max(0, effectiveWeeklyLimit - weekPaise);

  return {
    thisMonthExpensesPaise,
    lastMonthExpensesPaise,
    monthOverMonthPctChange,
    isMonthOverMonthIncrease: thisMonthExpensesPaise > lastMonthExpensesPaise,
    topCategory,
    highestWeekday,
    highestSpendingDay,
    lowestSpendingDay,
    avgDailySpendPaise,
    activeSpendingDaysCount: activeDays,
    increasingCategories,
    todaySpending: {
      date: todayStr,
      totalPaise: todayPaise,
      transactionCount: todayExpenses.length,
      limitPaise: effectiveDailyLimit,
      remainingPaise: remainingDailyPaise,
      isOverLimit: isOverDailyLimit,
      vsYesterdayPaise: todayPaise - yesterdayPaise,
      yesterdayPaise,
    },
    weeklySpending: {
      totalPaise: weekPaise,
      transactionCount: weekExpenses.length,
      limitPaise: effectiveWeeklyLimit,
      remainingPaise: remainingWeeklyPaise,
      isOverLimit: isOverWeeklyLimit,
    },
  };
}
