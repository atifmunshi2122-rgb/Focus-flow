import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Receipt,
  Plus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import type { Bill, ExpenseTransaction, IncomeTransaction } from '../../types/index.ts';
import { ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import { EmptyStateIllustration, useMotionPreferences } from '../ui/MotionPrimitives.tsx';

interface FinancialCalendarViewProps {
  onOpenQuickAction: () => void;
}

export const FinancialCalendarView: React.FC<FinancialCalendarViewProps> = ({ onOpenQuickAction }) => {
  const { currency, settings, refreshKey } = useApp();
  const { isDisabled } = useMotionPreferences();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  const [currentYear, setCurrentYear] = useState(() => Number(todayStr.slice(0, 4)));
  const [currentMonth, setCurrentMonth] = useState(() => Number(todayStr.slice(5, 7))); // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);

  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getExpenses().catch(() => []),
      api.getIncomes().catch(() => []),
      api.getBills().catch(() => []),
    ])
      .then(([expList, incList, billList]) => {
        setExpenses(expList);
        setIncomes(incList);
        setBills(billList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // Month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    setCurrentYear(Number(todayStr.slice(0, 4)));
    setCurrentMonth(Number(todayStr.slice(5, 7)));
    setSelectedDate(todayStr);
  };

  // Month stats
  const activeExpenses = useMemo(() => expenses.filter((e) => !e.deletedAt), [expenses]);
  const activeIncomes = useMemo(() => incomes.filter((i) => !i.deletedAt), [incomes]);
  const activeBills = useMemo(() => bills.filter((b) => !b.deletedAt), [bills]);

  const monthExpenses = useMemo(
    () => activeExpenses.filter((e) => e.date.startsWith(monthKey)),
    [activeExpenses, monthKey]
  );
  const monthIncomes = useMemo(
    () => activeIncomes.filter((i) => i.date.startsWith(monthKey)),
    [activeIncomes, monthKey]
  );

  const totalMonthExpPaise = monthExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const totalMonthIncPaise = monthIncomes.reduce((s, i) => s + i.amountPaise, 0);

  // Daily map
  const dailyData = useMemo(() => {
    const map: Record<string, { expPaise: number; incPaise: number; billCount: number }> = {};
    for (const exp of monthExpenses) {
      map[exp.date] = map[exp.date] || { expPaise: 0, incPaise: 0, billCount: 0 };
      map[exp.date].expPaise += exp.amountPaise;
    }
    for (const inc of monthIncomes) {
      map[inc.date] = map[inc.date] || { expPaise: 0, incPaise: 0, billCount: 0 };
      map[inc.date].incPaise += inc.amountPaise;
    }
    for (const b of activeBills) {
      if (b.dueDate.startsWith(monthKey)) {
        map[b.dueDate] = map[b.dueDate] || { expPaise: 0, incPaise: 0, billCount: 0 };
        map[b.dueDate].billCount += 1;
      }
    }
    return map;
  }, [monthExpenses, monthIncomes, activeBills, monthKey]);

  // Average daily expense in month for high spending threshold
  const daysWithSpend = Object.values(dailyData).filter((d) => d.expPaise > 0);
  const avgDailySpend = daysWithSpend.length > 0 ? totalMonthExpPaise / daysWithSpend.length : 0;
  const highSpendThreshold = Math.max(100000, avgDailySpend * 1.75); // At least ₹1000 and 1.75x average

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 = Sun
    const prevMonthDays = new Date(currentYear, currentMonth - 1, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      expPaise: number;
      incPaise: number;
      billCount: number;
      isHighSpend: boolean;
    }> = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        expPaise: 0,
        incPaise: 0,
        billCount: 0,
        isHighSpend: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const data = dailyData[dateStr] || { expPaise: 0, incPaise: 0, billCount: 0 };
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        expPaise: data.expPaise,
        incPaise: data.incPaise,
        billCount: data.billCount,
        isHighSpend: data.expPaise > highSpendThreshold,
      });
    }

    // Next month padding to fill grid
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining && days.length < 35; d++) {
      const nextM = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextY = currentMonth === 12 ? currentYear + 1 : currentYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        expPaise: 0,
        incPaise: 0,
        billCount: 0,
        isHighSpend: false,
      });
    }

    return days;
  }, [currentYear, currentMonth, dailyData, highSpendThreshold]);

  // Selected date transactions
  const selectedDayExpenses = useMemo(() => {
    if (!selectedDate) return [];
    return activeExpenses.filter((e) => e.date === selectedDate);
  }, [activeExpenses, selectedDate]);

  const selectedDayIncomes = useMemo(() => {
    if (!selectedDate) return [];
    return activeIncomes.filter((i) => i.date === selectedDate);
  }, [activeIncomes, selectedDate]);

  const selectedDayBills = useMemo(() => {
    if (!selectedDate) return [];
    return activeBills.filter((b) => b.dueDate === selectedDate);
  }, [activeBills, selectedDate]);

  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Calendar Header Toolbar */}
      <ThemeCard className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ThemeButton variant="secondary" size="sm" onClick={handlePrevMonth} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </ThemeButton>

          <h2 className="text-base font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-[var(--ff-accent-text)]" />
            {monthName}
          </h2>

          <ThemeButton variant="secondary" size="sm" onClick={handleNextMonth} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </ThemeButton>

          <ThemeButton variant="secondary" size="xs" onClick={handleJumpToday}>
            Today
          </ThemeButton>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--ff-success)]" />
            <span className="text-[var(--ff-text-muted)] font-mono font-semibold">
              +{formatCurrency(totalMonthIncPaise, currency)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--ff-danger)]" />
            <span className="text-[var(--ff-text-muted)] font-mono font-semibold">
              -{formatCurrency(totalMonthExpPaise, currency)}
            </span>
          </div>

          <ThemeButton variant="primary" size="sm" onClick={onOpenQuickAction}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add Record</span>
          </ThemeButton>
        </div>
      </ThemeCard>

      {/* Main Grid & Day Inspection Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Calendar Grid (lg:col-span-8) */}
        <ThemeCard className="lg:col-span-8 p-3 sm:p-4 space-y-3">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider py-1 border-b border-[var(--ff-border-color)]">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map((d) => {
              const isSelected = selectedDate === d.dateStr;
              const isToday = d.dateStr === todayStr;

              return (
                <button
                  key={d.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(d.dateStr)}
                  disabled={!d.isCurrentMonth}
                  className={`min-h-[64px] sm:min-h-[82px] p-1.5 rounded-xl text-left flex flex-col justify-between transition-all relative ${
                    !d.isCurrentMonth
                      ? 'opacity-30 cursor-not-allowed bg-transparent'
                      : isSelected
                        ? 'ring-2 ring-[var(--ff-accent)] bg-[var(--ff-surface-subtle)] shadow-md'
                        : isToday
                          ? 'border border-[var(--ff-accent-border)] bg-[var(--ff-surface-subtle)]'
                          : 'hover:bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]'
                  } ${d.isHighSpend ? 'ring-1 ring-[var(--ff-danger)]/50' : ''}`}
                >
                  {/* Day header */}
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-bold ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-[var(--ff-accent)] text-white flex items-center justify-center text-[10px]'
                          : isSelected
                            ? 'text-[var(--ff-accent-text)]'
                            : 'text-[var(--ff-text-primary)]'
                      }`}
                    >
                      {d.dayNum}
                    </span>

                    {d.isHighSpend && (
                      <span title="Unusually high spend day">
                        <AlertTriangle className="w-3 h-3 text-[var(--ff-danger)]" />
                      </span>
                    )}
                  </div>

                  {/* Flow Pills */}
                  <div className="space-y-0.5 w-full overflow-hidden text-[9px] sm:text-[10px] font-mono">
                    {d.incPaise > 0 && (
                      <div className="truncate rounded px-1 py-0.2 bg-[var(--ff-success-surface)] text-[var(--ff-success)] font-semibold">
                        +{formatCurrency(d.incPaise, currency)}
                      </div>
                    )}
                    {d.expPaise > 0 && (
                      <div className="truncate rounded px-1 py-0.2 bg-[var(--ff-danger-surface)] text-[var(--ff-danger)] font-semibold">
                        -{formatCurrency(d.expPaise, currency)}
                      </div>
                    )}
                    {d.billCount > 0 && (
                      <div className="text-[9px] text-[var(--ff-warning)] font-sans flex items-center gap-0.5">
                        <Receipt className="w-2.5 h-2.5" /> {d.billCount} bill{d.billCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ThemeCard>

        {/* Selected Date Detail Drawer (lg:col-span-4) */}
        <ThemeCard className="lg:col-span-4 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-3">
            <div>
              <span className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block">
                Selected Day
              </span>
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No date chosen'}
              </h3>
            </div>
            {selectedDate && (
              <ThemeButton variant="secondary" size="xs" onClick={onOpenQuickAction}>
                <Plus className="w-3 h-3" /> Add
              </ThemeButton>
            )}
          </div>

          {!selectedDate || (selectedDayExpenses.length === 0 && selectedDayIncomes.length === 0 && selectedDayBills.length === 0) ? (
            <div className="py-8">
              <EmptyStateIllustration
                icon={<CalendarIcon className="w-6 h-6" />}
                title="No events on this day"
                description="Select a date with income or expense dots to review itemized entries."
              />
            </div>
          ) : (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
              {/* Day Incomes */}
              {selectedDayIncomes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[var(--ff-success)] uppercase tracking-wider block">
                    Income Credited ({selectedDayIncomes.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedDayIncomes.map((i) => (
                      <div key={i.id} className="p-2.5 rounded-xl bg-[var(--ff-surface-subtle)] flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-[var(--ff-text-primary)] block">{i.source}</span>
                          <span className="text-[10px] text-[var(--ff-text-muted)]">{i.category}</span>
                        </div>
                        <span className="font-mono font-bold text-[var(--ff-success)]">
                          +{formatCurrency(i.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Day Expenses */}
              {selectedDayExpenses.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[var(--ff-danger)] uppercase tracking-wider block">
                    Expenses Incurred ({selectedDayExpenses.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedDayExpenses.map((e) => (
                      <div key={e.id} className="p-2.5 rounded-xl bg-[var(--ff-surface-subtle)] flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-[var(--ff-text-primary)] block">{e.description}</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--ff-text-muted)] mt-0.5">
                            <span>{e.categoryName || e.categoryId}</span>
                            <span>•</span>
                            <span className="uppercase">{e.paymentMethod.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-[var(--ff-danger)]">
                          -{formatCurrency(e.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Day Bills */}
              {selectedDayBills.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[var(--ff-warning)] uppercase tracking-wider block">
                    Bills Scheduled ({selectedDayBills.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedDayBills.map((b) => (
                      <div key={b.id} className="p-2.5 rounded-xl bg-[var(--ff-surface-subtle)] flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-[var(--ff-text-primary)] block">{b.name}</span>
                          <span className="text-[10px] text-[var(--ff-text-muted)] uppercase">{b.status}</span>
                        </div>
                        <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                          {formatCurrency(b.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ThemeCard>
      </div>
    </div>
  );
};
