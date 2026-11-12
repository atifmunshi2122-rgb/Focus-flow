import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Task, Bill, FocusSession, IncomeTransaction, ExpenseTransaction } from '../../types/index.ts';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  getDaysInMonth,
  getStartOfMonth,
  getEndOfMonth,
  getStartOfWeek,
  getEndOfWeek,
  formatDateInTimezone,
} from '../../lib/dateTime.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  X,
  CreditCard,
  CheckSquare,
} from 'lucide-react';

interface DaySummary {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  tasks: Task[];
  bills: Bill[];
  sessions: FocusSession[];
  focusMinutes: number;
  incomePaise: number;
  expensePaise: number;
}

export const ProductivityCalendar: React.FC = () => {
  const { currency, settings, refreshKey, triggerRefresh, showToast } = useApp();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  // Current viewed month: year and 1-based month
  const [currentYear, setCurrentYear] = useState(() => parseInt(todayStr.slice(0, 4), 10));
  const [currentMonth, setCurrentMonth] = useState(() => parseInt(todayStr.slice(5, 7), 10));
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedDay, setSelectedDay] = useState<DaySummary | null>(null);

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.getTasks(),
      api.getBills(),
      api.getFocusSessions(),
      api.getIncomes(),
      api.getExpenses(),
    ])
      .then(([t, b, s, inc, exp]) => {
        if (!isMounted) return;
        setTasks(t.filter((item) => !item.deletedAt));
        setBills(b.filter((item) => !item.deletedAt));
        setSessions(s);
        setIncomes(inc.filter((item) => !item.deletedAt));
        setExpenses(exp.filter((item) => !item.deletedAt));
      })
      .catch((err) => {
        if (isMounted) showToast('Failed to load calendar events', 'error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey, showToast]);

  // Calendar month grid calculation (deterministic, leap-year safe)
  const monthDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDayDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    // Day of week: 0 = Sunday, 1 = Monday ... 6 = Saturday
    // Convert to Monday = 0, ... Sunday = 6 for standard ISO work week
    const firstDayOfWeek = (new Date(`${firstDayDate}T12:00:00Z`).getUTCDay() + 6) % 7;

    const days: DaySummary[] = [];

    // Previous month padding
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonthDays = getDaysInMonth(prevYear, prevMonth);

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push(buildDaySummary(dateStr, dayNum, false, todayStr, tasks, bills, sessions, incomes, expenses));
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push(buildDaySummary(dateStr, dayNum, true, todayStr, tasks, bills, sessions, incomes, expenses));
    }

    // Next month padding to fill out 35 or 42 cells (exact grid)
    const totalSlots = days.length <= 35 ? 35 : 42;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    let nextDayNum = 1;

    while (days.length < totalSlots) {
      const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDayNum).padStart(2, '0')}`;
      days.push(buildDaySummary(dateStr, nextDayNum, false, todayStr, tasks, bills, sessions, incomes, expenses));
      nextDayNum++;
    }

    return days;
  }, [currentYear, currentMonth, todayStr, tasks, bills, sessions, incomes, expenses]);

  // Week view slice
  const weekDays = useMemo(() => {
    const startOfWeekStr = getStartOfWeek(todayStr);
    const days: DaySummary[] = [];
    const baseDate = new Date(`${startOfWeekStr}T12:00:00Z`);

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setUTCDate(baseDate.getUTCDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayNum = d.getUTCDate();
      days.push(buildDaySummary(dateStr, dayNum, true, todayStr, tasks, bills, sessions, incomes, expenses));
    }
    return days;
  }, [todayStr, tasks, bills, sessions, incomes, expenses]);

  const displayedDays = viewMode === 'month' ? monthDays : weekDays;

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

  const handleToday = () => {
    setCurrentYear(parseInt(todayStr.slice(0, 4), 10));
    setCurrentMonth(parseInt(todayStr.slice(5, 7), 10));
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}
          >
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
              Productivity Calendar
            </h1>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Unified schedule of tasks, bill maturities, focus cycles and cashflows
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[var(--ff-card-bg)] border ff-divider rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'month'
                  ? 'bg-[var(--ff-accent)] text-white shadow-xs'
                  : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'week'
                  ? 'bg-[var(--ff-accent)] text-white shadow-xs'
                  : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              This Week
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[var(--ff-card-bg)] border ff-divider rounded-lg p-1">
            <ThemeButton variant="ghost" size="sm" onClick={handlePrevMonth} aria-label="Previous month" className="p-1.5">
              <ChevronLeft className="w-4 h-4" />
            </ThemeButton>
            <span className="text-xs font-bold font-mono px-2 min-w-[120px] text-center text-[var(--ff-text-primary)]">
              {monthNames[currentMonth - 1]} {currentYear}
            </span>
            <ThemeButton variant="ghost" size="sm" onClick={handleNextMonth} aria-label="Next month" className="p-1.5">
              <ChevronRight className="w-4 h-4" />
            </ThemeButton>
          </div>

          <ThemeButton variant="secondary" size="sm" onClick={handleToday}>
            Today
          </ThemeButton>
        </div>
      </div>

      {/* Weekday Header */}
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[var(--ff-text-muted)] uppercase tracking-wider py-1">
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
        <div>Sun</div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {displayedDays.map((day) => {
          const hasEvents = day.tasks.length > 0 || day.bills.length > 0 || day.focusMinutes > 0;
          const netPaise = day.incomePaise - day.expensePaise;

          return (
            <button
              key={day.date}
              onClick={() => setSelectedDay(day)}
              className={`flex flex-col text-left p-2.5 min-h-[108px] rounded-xl border transition-all duration-150 relative group ${
                day.isToday
                  ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/20 shadow-xs ring-1 ring-[var(--ff-accent)]'
                  : day.isCurrentMonth
                  ? 'bg-[var(--ff-card-bg)] border-[var(--ff-border)] hover:border-[var(--ff-border-hover)] hover:shadow-xs'
                  : 'bg-[var(--ff-card-bg)]/40 border-[var(--ff-border)]/50 opacity-40 hover:opacity-75'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between w-full mb-1.5">
                <span
                  className={`text-xs font-bold font-mono rounded-md px-1.5 py-0.5 ${
                    day.isToday
                      ? 'bg-[var(--ff-accent)] text-white'
                      : 'text-[var(--ff-text-primary)]'
                  }`}
                >
                  {day.dayNumber}
                </span>

                {day.focusMinutes > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-mono text-[var(--ff-accent-text)] font-semibold">
                    <Clock className="w-2.5 h-2.5" />
                    {day.focusMinutes}m
                  </span>
                )}
              </div>

              {/* Event Indicators */}
              <div className="flex flex-col gap-1 w-full flex-1 overflow-hidden">
                {/* Bills Due */}
                {day.bills.slice(0, 2).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded truncate font-medium"
                    style={{
                      backgroundColor: b.status === 'PAID' ? 'var(--ff-success-soft)' : 'var(--ff-danger-soft)',
                      color: b.status === 'PAID' ? 'var(--ff-success)' : 'var(--ff-danger)',
                    }}
                  >
                    <span className="truncate">{b.name}</span>
                    <span className="font-mono font-bold shrink-0 ml-1">
                      {formatCurrency(b.amountPaise, currency)}
                    </span>
                  </div>
                ))}
                {day.bills.length > 2 && (
                  <span className="text-[9px] text-[var(--ff-text-muted)] font-mono pl-1">
                    +{day.bills.length - 2} more bills
                  </span>
                )}

                {/* Tasks Due */}
                {day.tasks.slice(0, 2).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded truncate bg-[var(--ff-muted)]/60 text-[var(--ff-text-secondary)] font-medium"
                  >
                    <CheckCircle2
                      className={`w-2.5 h-2.5 shrink-0 ${
                        t.status === 'completed' ? 'text-[var(--ff-success)]' : 'text-[var(--ff-text-muted)]'
                      }`}
                    />
                    <span className={`truncate ${t.status === 'completed' ? 'line-through opacity-70' : ''}`}>
                      {t.title}
                    </span>
                  </div>
                ))}
                {day.tasks.length > 2 && (
                  <span className="text-[9px] text-[var(--ff-text-muted)] font-mono pl-1">
                    +{day.tasks.length - 2} more tasks
                  </span>
                )}
              </div>

              {/* Net Cashflow indicator */}
              {(day.incomePaise > 0 || day.expensePaise > 0) && (
                <div
                  className={`mt-1 text-[9px] font-mono font-bold text-right w-full ${
                    netPaise >= 0 ? 'text-[var(--ff-success)]' : 'text-[var(--ff-danger)]'
                  }`}
                >
                  {netPaise >= 0 ? '+' : '-'}
                  {formatCurrency(Math.abs(netPaise), currency)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Day Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className="w-full max-w-lg bg-[var(--ff-card-bg)] border ff-divider rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b ff-divider">
              <div>
                <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                  {new Date(`${selectedDay.date}T12:00:00Z`).toLocaleDateString('en-US', {
                    timeZone: tz,
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h3>
                <p className="text-xs text-[var(--ff-text-muted)] font-mono">
                  {selectedDay.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-6">
              {/* Daily Stats Summary Banner */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[var(--ff-card-bg)] border ff-divider text-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
                    Focus Time
                  </span>
                  <span className="text-sm font-bold font-mono text-[var(--ff-accent-text)]">
                    {selectedDay.focusMinutes} mins
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--ff-card-bg)] border ff-divider text-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
                    Income
                  </span>
                  <span className="text-sm font-bold font-mono text-[var(--ff-success)]">
                    {formatCurrency(selectedDay.incomePaise, currency)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--ff-card-bg)] border ff-divider text-center">
                  <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
                    Expenses
                  </span>
                  <span className="text-sm font-bold font-mono text-[var(--ff-danger)]">
                    {formatCurrency(selectedDay.expensePaise, currency)}
                  </span>
                </div>
              </div>

              {/* Bills Section */}
              <div>
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider">
                  <CreditCard className="w-4 h-4 text-[var(--ff-accent)]" />
                  <span>Bills Due ({selectedDay.bills.length})</span>
                </div>
                {selectedDay.bills.length === 0 ? (
                  <p className="text-xs text-[var(--ff-text-muted)] italic">No bills scheduled on this day.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedDay.bills.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-3 rounded-xl border ff-divider bg-[var(--ff-muted)]/20"
                      >
                        <div>
                          <p className="text-sm font-bold text-[var(--ff-text-primary)]">{b.name}</p>
                          <span className="text-[10px] text-[var(--ff-text-muted)]">
                            Status: <strong className="uppercase">{b.status}</strong>
                          </span>
                        </div>
                        <span className="font-mono font-bold text-sm text-[var(--ff-text-primary)]">
                          {formatCurrency(b.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tasks Section */}
              <div>
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider">
                  <CheckSquare className="w-4 h-4 text-[var(--ff-accent)]" />
                  <span>Tasks Due ({selectedDay.tasks.length})</span>
                </div>
                {selectedDay.tasks.length === 0 ? (
                  <p className="text-xs text-[var(--ff-text-muted)] italic">No tasks due on this day.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedDay.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-xl border ff-divider bg-[var(--ff-muted)]/20"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              t.status === 'completed' ? 'text-[var(--ff-success)]' : 'text-[var(--ff-text-muted)]'
                            }`}
                          />
                          <p className={`text-sm font-medium truncate ${t.status === 'completed' ? 'line-through opacity-70' : ''}`}>
                            {t.title}
                          </p>
                        </div>
                        <ThemeBadge tone="neutral">
                          {t.priority}
                        </ThemeBadge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t ff-divider flex justify-end">
              <ThemeButton variant="secondary" size="sm" onClick={() => setSelectedDay(null)}>
                Close
              </ThemeButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function buildDaySummary(
  dateStr: string,
  dayNumber: number,
  isCurrentMonth: boolean,
  todayStr: string,
  tasks: Task[],
  bills: Bill[],
  sessions: FocusSession[],
  incomes: IncomeTransaction[],
  expenses: ExpenseTransaction[]
): DaySummary {
  const dayTasks = tasks.filter((t) => t.dueDate === dateStr);
  const dayBills = bills.filter((b) => b.dueDate === dateStr);
  const daySessions = sessions.filter((s) => s.startedAt.slice(0, 10) === dateStr && s.completed);
  const focusMinutes = Math.round(
    daySessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60
  );
  const incomePaise = incomes
    .filter((i) => i.date === dateStr)
    .reduce((acc, i) => acc + i.amountPaise, 0);
  const expensePaise = expenses
    .filter((e) => e.date === dateStr)
    .reduce((acc, e) => acc + e.amountPaise, 0);

  return {
    date: dateStr,
    dayNumber,
    isToday: dateStr === todayStr,
    isCurrentMonth,
    tasks: dayTasks,
    bills: dayBills,
    sessions: daySessions,
    focusMinutes,
    incomePaise,
    expensePaise,
  };
}
