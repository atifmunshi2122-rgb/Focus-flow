import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { clientDataCache } from '../../lib/dataCache.ts';
import {
  Task,
  Bill,
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  Habit,
} from '../../types/index.ts';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  getDaysInMonth,
  getStartOfWeek,
  formatDateInTimezone,
} from '../../lib/dateTime.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { getSpringTransition, MOTION_DURATION } from '../../theme/motionTokens.ts';
import { GoogleCalendarSyncPanel } from './GoogleCalendarSyncPanel.tsx';
import { googleCalendarClient } from '../../lib/googleCalendarService.ts';
import type { GoogleCalendarEntry } from '../../types/calendar.ts';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle,
  X,
  CreditCard,
  CheckSquare,
  Plus,
  Receipt,
  Flame,
  Layers,
  Target,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { type QuickActionType } from '../common/QuickActionModal.tsx';

export interface ProductivityCalendarProps {
  onOpenQuickAction?: (
    initialType?: QuickActionType | string,
    initialDate?: string,
    context?: 'global' | 'finance' | 'calendar'
  ) => void;
}

interface DaySummary {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  tasks: Task[];
  bills: Bill[];
  sessions: FocusSession[];
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  habits: Habit[];
  focusMinutes: number;
  incomePaise: number;
  expensePaise: number;
}

export const ProductivityCalendar: React.FC<ProductivityCalendarProps> = ({ onOpenQuickAction }) => {
  const { currency, settings, refreshKey, triggerRefresh, showToast } = useApp();
  const { intensity, isDisabled } = useMotionPreferences();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  // Current viewed month and week navigation state
  const [viewYearMonth, setViewYearMonth] = useState(() => {
    const y = parseInt(todayStr.slice(0, 4), 10);
    const m = parseInt(todayStr.slice(5, 7), 10);
    return { year: y, month: m };
  });
  const currentYear = viewYearMonth.year;
  const currentMonth = viewYearMonth.month;

  const [activeWeekStart, setActiveWeekStart] = useState(() => getStartOfWeek(todayStr, tz));
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  // Data state
  const cachedTasks = clientDataCache.getTasks();
  const cachedBills = clientDataCache.getBills();
  const cachedSessions = clientDataCache.getFocusSessions();
  const cachedIncomes = clientDataCache.getIncomes();
  const cachedExpenses = clientDataCache.getExpenses();
  const cachedHabits = clientDataCache.getHabits();
  const hasCachedCalendar = Boolean(
    cachedTasks || cachedBills || cachedSessions || cachedIncomes || cachedExpenses || cachedHabits
  );

  const [tasks, setTasks] = useState<Task[]>(() => (cachedTasks ? cachedTasks.filter((item) => !item.deletedAt) : []));
  const [bills, setBills] = useState<Bill[]>(() => (cachedBills ? cachedBills.filter((item) => !item.deletedAt) : []));
  const [sessions, setSessions] = useState<FocusSession[]>(() => cachedSessions || []);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>(() => (cachedIncomes ? cachedIncomes.filter((item) => !item.deletedAt) : []));
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>(() => (cachedExpenses ? cachedExpenses.filter((item) => !item.deletedAt) : []));
  const [habits, setHabits] = useState<Habit[]>(() => (cachedHabits ? cachedHabits.filter((item) => !item.deletedAt) : []));
  const [loading, setLoading] = useState(!hasCachedCalendar);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEntry[]>([]);
  const [showGoogleEvents, setShowGoogleEvents] = useState<boolean>(true);

  const fetchCalendarData = () => {
    if (!hasCachedCalendar && tasks.length === 0) {
      setLoading(true);
    }
    setLoadError(null);

    Promise.all([
      api.getTasks(),
      api.getBills(),
      api.getFocusSessions(),
      api.getIncomes(),
      api.getExpenses(),
      api.getHabits().catch(() => []),
    ])
      .then(([t, b, s, inc, exp, h]) => {
        setTasks(t.filter((item) => !item.deletedAt));
        clientDataCache.setTasks(t);
        setBills(b.filter((item) => !item.deletedAt));
        clientDataCache.setBills(b);
        setSessions(s);
        clientDataCache.setFocusSessions(s);
        setIncomes(inc.filter((item) => !item.deletedAt));
        clientDataCache.setIncomes(inc);
        setExpenses(exp.filter((item) => !item.deletedAt));
        clientDataCache.setExpenses(exp);
        setHabits(h.filter((item) => !item.deletedAt));
        clientDataCache.setHabits(h);
        setIsStale(false);
        googleCalendarClient.getEvents().then(setGoogleEvents).catch(() => []);
      })
      .catch((err) => {
        console.error('Failed to load calendar events:', err);
        if (hasCachedCalendar || tasks.length > 0 || bills.length > 0) {
          setIsStale(true);
        } else {
          setLoadError('Failed to load calendar events. Please check your network connection.');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCalendarData();
  }, [refreshKey]);

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
      days.push(buildDaySummary(dateStr, dayNum, false, todayStr, tz, tasks, bills, sessions, incomes, expenses, habits));
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push(buildDaySummary(dateStr, dayNum, true, todayStr, tz, tasks, bills, sessions, incomes, expenses, habits));
    }

    // Next month padding to fill out 35 or 42 cells (exact grid)
    const totalSlots = days.length <= 35 ? 35 : 42;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    let nextDayNum = 1;

    while (days.length < totalSlots) {
      const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDayNum).padStart(2, '0')}`;
      days.push(buildDaySummary(dateStr, nextDayNum, false, todayStr, tz, tasks, bills, sessions, incomes, expenses, habits));
      nextDayNum++;
    }

    return days;
  }, [currentYear, currentMonth, todayStr, tz, tasks, bills, sessions, incomes, expenses, habits]);

  // Week view slice based on activeWeekStart
  const weekDays = useMemo(() => {
    const days: DaySummary[] = [];
    const baseDate = new Date(`${activeWeekStart}T12:00:00Z`);

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setUTCDate(baseDate.getUTCDate() + i);
      const dateStr = formatDateInTimezone(d, tz);
      const dayNum = d.getUTCDate();
      const isCurrentMonth = d.getUTCMonth() + 1 === currentMonth;
      days.push(buildDaySummary(dateStr, dayNum, isCurrentMonth, todayStr, tz, tasks, bills, sessions, incomes, expenses, habits));
    }
    return days;
  }, [activeWeekStart, currentMonth, todayStr, tz, tasks, bills, sessions, incomes, expenses, habits]);

  const displayedDays = viewMode === 'month' ? monthDays : weekDays;

  const selectedDayGoogleEvents = useMemo(() => {
    if (!selectedDateStr || !showGoogleEvents) return [];
    return googleEvents.filter((ge) => (ge.start.date || ge.start.dateTime?.slice(0, 10)) === selectedDateStr);
  }, [selectedDateStr, showGoogleEvents, googleEvents]);

  // Selected day derived dynamically from live state so additions and edits update immediately
  const selectedDay = useMemo(() => {
    if (!selectedDateStr) return null;
    const inMonth = monthDays.find((d) => d.date === selectedDateStr);
    if (inMonth) return inMonth;
    const inWeek = weekDays.find((d) => d.date === selectedDateStr);
    if (inWeek) return inWeek;
    const dayNum = parseInt(selectedDateStr.slice(8, 10), 10) || 1;
    return buildDaySummary(
      selectedDateStr,
      dayNum,
      true,
      todayStr,
      tz,
      tasks,
      bills,
      sessions,
      incomes,
      expenses,
      habits
    );
  }, [selectedDateStr, monthDays, weekDays, todayStr, tz, tasks, bills, sessions, incomes, expenses, habits]);

  // Month & Week navigation handlers (atomic, prevents desync)
  const handlePrev = () => {
    if (viewMode === 'week') {
      const d = new Date(`${activeWeekStart}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 7);
      const newWeekStart = formatDateInTimezone(d, tz);
      setActiveWeekStart(newWeekStart);

      // Keep month in sync with the new week's midpoint
      const mid = new Date(`${newWeekStart}T12:00:00Z`);
      mid.setUTCDate(mid.getUTCDate() + 3);
      setViewYearMonth({ year: mid.getUTCFullYear(), month: mid.getUTCMonth() + 1 });
    } else {
      setViewYearMonth(({ year, month }) => {
        if (month === 1) {
          return { year: year - 1, month: 12 };
        }
        return { year, month: month - 1 };
      });
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      const d = new Date(`${activeWeekStart}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 7);
      const newWeekStart = formatDateInTimezone(d, tz);
      setActiveWeekStart(newWeekStart);

      // Keep month in sync with the new week's midpoint
      const mid = new Date(`${newWeekStart}T12:00:00Z`);
      mid.setUTCDate(mid.getUTCDate() + 3);
      setViewYearMonth({ year: mid.getUTCFullYear(), month: mid.getUTCMonth() + 1 });
    } else {
      setViewYearMonth(({ year, month }) => {
        if (month === 12) {
          return { year: year + 1, month: 1 };
        }
        return { year, month: month + 1 };
      });
    }
  };

  const handleToday = () => {
    const y = parseInt(todayStr.slice(0, 4), 10);
    const m = parseInt(todayStr.slice(5, 7), 10);
    setViewYearMonth({ year: y, month: m });
    setActiveWeekStart(getStartOfWeek(todayStr, tz));
  };

  const handleToggleTaskStatus = async (task: Task) => {
    const nextStatus: 'todo' | 'completed' = task.status === 'completed' ? 'todo' : 'completed';
    // Optimistic local state update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: nextStatus,
              completedAt: nextStatus === 'completed' ? new Date().toISOString() : null,
            }
          : t
      )
    );
    try {
      await api.updateTask(task.id, {
        status: nextStatus,
        completedAt: nextStatus === 'completed' ? new Date().toISOString() : null,
      });
      triggerRefresh();
    } catch {
      showToast('Failed to update task', 'error');
      // Revert if error
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Week range label (e.g. "Nov 9 – 15, 2026" or "Nov 30 – Dec 6, 2026")
  const weekRangeLabel = useMemo(() => {
    if (weekDays.length < 7) return '';
    const first = weekDays[0];
    const last = weekDays[6];
    const d1 = new Date(`${first.date}T12:00:00Z`);
    const d2 = new Date(`${last.date}T12:00:00Z`);
    const m1 = monthNames[d1.getUTCMonth()].slice(0, 3);
    const m2 = monthNames[d2.getUTCMonth()].slice(0, 3);
    if (m1 === m2) {
      return `${m1} ${d1.getUTCDate()} – ${d2.getUTCDate()}, ${d2.getUTCFullYear()}`;
    }
    return `${m1} ${d1.getUTCDate()} – ${m2} ${d2.getUTCDate()}, ${d2.getUTCFullYear()}`;
  }, [weekDays]);

  return (
    <div className="flex flex-col gap-6">
      {/* Google Calendar Two-Way Sync Header Panel */}
      <GoogleCalendarSyncPanel
        onSyncComplete={fetchCalendarData}
        showEventsToggle={true}
        showEvents={showGoogleEvents}
        onToggleShowEvents={setShowGoogleEvents}
      />

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
              Unified schedule of tasks, bills, focus cycles, cashflows, and daily entries
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
              onClick={() => {
                setViewMode('week');
                if (!activeWeekStart) {
                  setActiveWeekStart(getStartOfWeek(todayStr, tz));
                }
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'week'
                  ? 'bg-[var(--ff-accent)] text-white shadow-xs'
                  : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              Week
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[var(--ff-card-bg)] border ff-divider rounded-lg p-1">
            <ThemeButton
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
              className="p-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
            </ThemeButton>
            <span className="text-xs font-bold font-mono px-2 min-w-[140px] text-center text-[var(--ff-text-primary)] select-none">
              {viewMode === 'week' ? weekRangeLabel : `${monthNames[currentMonth - 1]} ${currentYear}`}
            </span>
            <ThemeButton
              variant="ghost"
              size="sm"
              onClick={handleNext}
              aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
              className="p-1.5"
            >
              <ChevronRight className="w-4 h-4" />
            </ThemeButton>
          </div>

          <ThemeButton variant="secondary" size="sm" onClick={handleToday}>
            Today
          </ThemeButton>
        </div>
      </div>

      {/* Stale Cache Notice */}
      {isStale && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs font-medium">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Cached calendar metrics: Displaying previously saved schedule while reconnecting.</span>
          </div>
          <button
            onClick={() => fetchCalendarData()}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 transition-colors text-xs font-semibold shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Network Failure State when no cached data exists */}
      {loadError && tasks.length === 0 && bills.length === 0 ? (
        <div className="p-8 text-center my-6 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-card-bg)]">
          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-[var(--ff-text-primary)] mb-1">
              Unable to Load Calendar Events
            </h3>
            <p className="text-sm text-[var(--ff-text-muted)] mb-5">
              {loadError}
            </p>
            <ThemeButton variant="primary" size="sm" onClick={() => fetchCalendarData()}>
              <RotateCcw className="w-4 h-4 mr-2" />
              <span>Retry Connection</span>
            </ThemeButton>
          </div>
        </div>
      ) : (
        <>
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
          const netPaise = day.incomePaise - day.expensePaise;
          const dayGoogleEvents = showGoogleEvents
            ? googleEvents.filter((ge) => (ge.start.date || ge.start.dateTime?.slice(0, 10)) === day.date)
            : [];

          return (
            <button
              key={day.date}
              onClick={() => setSelectedDateStr(day.date)}
              className={`flex flex-col text-left p-2.5 ${
                viewMode === 'week' ? 'min-h-[220px]' : 'min-h-[112px]'
              } rounded-xl border transition-all duration-150 relative group ${
                day.isToday
                  ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/20 shadow-xs ring-1 ring-[var(--ff-accent)]'
                  : day.isCurrentMonth
                  ? 'bg-[var(--ff-card-bg)] border-[var(--ff-border)] hover:border-[var(--ff-accent)] hover:shadow-xs'
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

                <div className="flex items-center gap-1">
                  {day.focusMinutes > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-mono text-[var(--ff-accent-text)] font-semibold">
                      <Clock className="w-2.5 h-2.5" />
                      {day.focusMinutes}m
                    </span>
                  )}
                  {/* Subtle hover plus badge */}
                  <span
                    title={`Click to open ${day.date}`}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--ff-text-muted)] group-hover:text-[var(--ff-accent-text)] transition-opacity"
                  >
                    <Plus className="w-3 h-3" />
                  </span>
                </div>
              </div>

              {/* Event Indicators */}
              <div className="flex flex-col gap-1 w-full flex-1 overflow-hidden">
                {/* Bills Due */}
                {day.bills.slice(0, viewMode === 'week' ? 3 : 2).map((b) => (
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
                {day.bills.length > (viewMode === 'week' ? 3 : 2) && (
                  <span className="text-[9px] text-[var(--ff-text-muted)] font-mono pl-1">
                    +{day.bills.length - (viewMode === 'week' ? 3 : 2)} more bills
                  </span>
                )}

                {/* Tasks Due */}
                {day.tasks.slice(0, viewMode === 'week' ? 3 : 2).map((t) => (
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
                {day.tasks.length > (viewMode === 'week' ? 3 : 2) && (
                  <span className="text-[9px] text-[var(--ff-text-muted)] font-mono pl-1">
                    +{day.tasks.length - (viewMode === 'week' ? 3 : 2)} more tasks
                  </span>
                )}

                {/* Google Calendar Events */}
                {showGoogleEvents &&
                  dayGoogleEvents.slice(0, viewMode === 'week' ? 3 : 2).map((ge) => (
                    <div
                      key={ge.id}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded truncate bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                      title={`${ge.summary || '(Untitled Event)'} ${
                        ge.managePolicy === 'focusflow_managed' ? '(FocusFlow)' : '(Google Read-Only)'
                      }`}
                    >
                      <CalendarIcon className="w-2.5 h-2.5 shrink-0 text-blue-500" />
                      <span className="truncate">{ge.summary || '(Untitled Event)'}</span>
                    </div>
                  ))}
                {showGoogleEvents && dayGoogleEvents.length > (viewMode === 'week' ? 3 : 2) && (
                  <span className="text-[9px] text-[var(--ff-text-muted)] font-mono pl-1">
                    +{dayGoogleEvents.length - (viewMode === 'week' ? 3 : 2)} more Google events
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
      </>
      )}

      {/* Day Details Central Hub Modal */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            key="calendar-day-modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            initial={isDisabled ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={isDisabled ? undefined : { opacity: 0 }}
            transition={{ duration: MOTION_DURATION.overlay }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedDateStr(null);
            }}
          >
            <motion.div
              className="w-full max-w-xl bg-[var(--ff-card-bg)] border ff-divider rounded-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
              role="dialog"
              aria-modal="true"
              initial={isDisabled ? false : { opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={isDisabled ? undefined : { opacity: 0, scale: 0.95, y: 12 }}
              transition={getSpringTransition(intensity, isDisabled)}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b ff-divider bg-[var(--ff-surface-card)]">
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
                    {selectedDay.date} {selectedDay.isToday && '• Today'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDateStr(null)}
                  className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto flex flex-col gap-5">
                {/* === CONTEXTUAL QUICK ADD BAR === */}
                <div className="p-3.5 rounded-xl bg-[var(--ff-surface-muted)]/70 border border-[var(--ff-border-color)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                      <span>Add to this Day</span>
                    </span>
                    <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                      Prefills {selectedDay.date}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('expense', selectedDay.date, 'calendar')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--ff-surface-card)] hover:bg-[var(--ff-danger-soft)] text-[var(--ff-text-primary)] hover:text-[var(--ff-danger)] border border-[var(--ff-border-color)] transition-all text-xs font-bold shadow-xs active:scale-95"
                    >
                      <Receipt className="w-3.5 h-3.5 text-[var(--ff-danger)]" />
                      <span>+ Expense</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('income', selectedDay.date, 'calendar')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--ff-surface-card)] hover:bg-[var(--ff-success-soft)] text-[var(--ff-text-primary)] hover:text-[var(--ff-success)] border border-[var(--ff-border-color)] transition-all text-xs font-bold shadow-xs active:scale-95"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-[var(--ff-success)]" />
                      <span>+ Income</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('task', selectedDay.date, 'calendar')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--ff-surface-card)] hover:bg-[var(--ff-accent-soft)] text-[var(--ff-text-primary)] hover:text-[var(--ff-accent-text)] border border-[var(--ff-border-color)] transition-all text-xs font-bold shadow-xs active:scale-95"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                      <span>+ Task</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('bill', selectedDay.date, 'calendar')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--ff-surface-card)] hover:bg-[var(--ff-warning-soft)] text-[var(--ff-text-primary)] hover:text-[var(--ff-warning)] border border-[var(--ff-border-color)] transition-all text-xs font-bold shadow-xs active:scale-95"
                    >
                      <CalendarIcon className="w-3.5 h-3.5 text-[var(--ff-warning)]" />
                      <span>+ Bill</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[var(--ff-border-color)]/60">
                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('habit', selectedDay.date, 'calendar')}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface-card)] hover:bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)] transition-all text-[11px] font-medium"
                    >
                      <Flame className="w-3 h-3 text-orange-500" />
                      <span>+ Habit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('envelope', selectedDay.date, 'calendar')}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface-card)] hover:bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)] transition-all text-[11px] font-medium"
                    >
                      <Layers className="w-3 h-3 text-indigo-400" />
                      <span>+ Budget</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('goal', selectedDay.date, 'calendar')}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface-card)] hover:bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)] transition-all text-[11px] font-medium"
                    >
                      <Target className="w-3 h-3 text-emerald-400" />
                      <span>+ Savings</span>
                    </button>
                  </div>
                </div>

                {/* Daily KPI Stats Summary Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border ff-divider text-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
                      Focus Time
                    </span>
                    <span className="text-sm font-bold font-mono text-[var(--ff-accent-text)]">
                      {selectedDay.focusMinutes} mins
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border ff-divider text-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
                      Income
                    </span>
                    <span className="text-sm font-bold font-mono text-[var(--ff-success)]">
                      {formatCurrency(selectedDay.incomePaise, currency)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border ff-divider text-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
                      Expenses
                    </span>
                    <span className="text-sm font-bold font-mono text-[var(--ff-danger)]">
                      {formatCurrency(selectedDay.expensePaise, currency)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--ff-surface-card)] border ff-divider text-center">
                    <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
                      Net Flow
                    </span>
                    <span
                      className={`text-sm font-bold font-mono ${
                        selectedDay.incomePaise - selectedDay.expensePaise >= 0
                          ? 'text-[var(--ff-success)]'
                          : 'text-[var(--ff-danger)]'
                      }`}
                    >
                      {selectedDay.incomePaise - selectedDay.expensePaise >= 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(selectedDay.incomePaise - selectedDay.expensePaise), currency)}
                    </span>
                  </div>
                </div>

                {/* === EXPENSES SECTION === */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-[var(--ff-danger)]">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Expenses Incurred ({selectedDay.expenses.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('expense', selectedDay.date, 'calendar')}
                      className="text-[11px] font-semibold text-[var(--ff-accent-text)] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  {selectedDay.expenses.length === 0 ? (
                    <div className="p-3.5 rounded-xl border ff-divider bg-[var(--ff-muted)]/15 text-center">
                      <p className="text-xs text-[var(--ff-text-muted)]">No expenses recorded on this day.</p>
                      <button
                        type="button"
                        onClick={() => onOpenQuickAction?.('expense', selectedDay.date, 'calendar')}
                        className="mt-1.5 text-xs text-[var(--ff-accent-text)] font-semibold hover:underline"
                      >
                        + Add Expense
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedDay.expenses.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between p-3 rounded-xl border ff-divider bg-[var(--ff-surface-subtle)]"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                              {e.description || e.categoryName || 'Expense'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--ff-text-muted)]">
                              <span>{e.categoryName || e.categoryId}</span>
                              {e.paymentMethod && (
                                <>
                                  <span>•</span>
                                  <span className="uppercase font-mono">{e.paymentMethod.replace('_', ' ')}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-xs text-[var(--ff-danger)] shrink-0">
                            -{formatCurrency(e.amountPaise, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* === INCOME SECTION === */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-[var(--ff-success)]">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Income Credited ({selectedDay.incomes.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('income', selectedDay.date, 'calendar')}
                      className="text-[11px] font-semibold text-[var(--ff-accent-text)] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  {selectedDay.incomes.length === 0 ? (
                    <div className="p-3.5 rounded-xl border ff-divider bg-[var(--ff-muted)]/15 text-center">
                      <p className="text-xs text-[var(--ff-text-muted)]">No income credited on this day.</p>
                      <button
                        type="button"
                        onClick={() => onOpenQuickAction?.('income', selectedDay.date, 'calendar')}
                        className="mt-1.5 text-xs text-[var(--ff-accent-text)] font-semibold hover:underline"
                      >
                        + Add Income
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedDay.incomes.map((inc) => (
                        <div
                          key={inc.id}
                          className="flex items-center justify-between p-3 rounded-xl border ff-divider bg-[var(--ff-surface-subtle)]"
                        >
                          <div>
                            <p className="text-xs font-bold text-[var(--ff-text-primary)]">
                              {inc.source}
                            </p>
                            <span className="text-[10px] text-[var(--ff-text-muted)]">
                              {inc.category}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-xs text-[var(--ff-success)]">
                            +{formatCurrency(inc.amountPaise, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* === TASKS SECTION === */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-[var(--ff-accent-text)]">
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Tasks Due ({selectedDay.tasks.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('task', selectedDay.date, 'calendar')}
                      className="text-[11px] font-semibold text-[var(--ff-accent-text)] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  {selectedDay.tasks.length === 0 ? (
                    <div className="p-3.5 rounded-xl border ff-divider bg-[var(--ff-muted)]/15 text-center">
                      <p className="text-xs text-[var(--ff-text-muted)]">No tasks scheduled for this day.</p>
                      <button
                        type="button"
                        onClick={() => onOpenQuickAction?.('task', selectedDay.date, 'calendar')}
                        className="mt-1.5 text-xs text-[var(--ff-accent-text)] font-semibold hover:underline"
                      >
                        + Add Task
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedDay.tasks.map((t) => {
                        const isDone = t.status === 'completed';
                        return (
                          <div
                            key={t.id}
                            className="flex items-center justify-between p-3 rounded-xl border ff-divider bg-[var(--ff-surface-subtle)] gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleToggleTaskStatus(t)}
                                title={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                                className="p-0.5 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] transition-colors"
                              >
                                {isDone ? (
                                  <CheckCircle2 className="w-4 h-4 text-[var(--ff-success)]" />
                                ) : (
                                  <Circle className="w-4 h-4 text-[var(--ff-text-muted)] hover:text-[var(--ff-accent)]" />
                                )}
                              </button>
                              <p className={`text-xs font-medium truncate ${isDone ? 'line-through opacity-70' : ''}`}>
                                {t.title}
                              </p>
                            </div>
                            <ThemeBadge tone={t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'neutral'}>
                              {t.priority}
                            </ThemeBadge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* === BILLS SECTION === */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-[var(--ff-warning)]">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Bills Scheduled ({selectedDay.bills.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenQuickAction?.('bill', selectedDay.date, 'calendar')}
                      className="text-[11px] font-semibold text-[var(--ff-accent-text)] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  {selectedDay.bills.length === 0 ? (
                    <div className="p-3.5 rounded-xl border ff-divider bg-[var(--ff-muted)]/15 text-center">
                      <p className="text-xs text-[var(--ff-text-muted)]">No bills scheduled for this day.</p>
                      <button
                        type="button"
                        onClick={() => onOpenQuickAction?.('bill', selectedDay.date, 'calendar')}
                        className="mt-1.5 text-xs text-[var(--ff-accent-text)] font-semibold hover:underline"
                      >
                        + Add Bill
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedDay.bills.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between p-3 rounded-xl border ff-divider bg-[var(--ff-surface-subtle)]"
                        >
                          <div>
                            <p className="text-xs font-bold text-[var(--ff-text-primary)]">{b.name}</p>
                            <span className="text-[10px] text-[var(--ff-text-muted)] uppercase">
                              Status: <strong>{b.status}</strong>
                            </span>
                          </div>
                          <span className="font-mono font-bold text-xs text-[var(--ff-text-primary)]">
                            {formatCurrency(b.amountPaise, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* === HABITS COMPLETED === */}
                {selectedDay.habits.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-500" />
                      <span>Habits Completed ({selectedDay.habits.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedDay.habits.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ff-divider bg-[var(--ff-surface-subtle)] text-xs font-medium"
                        >
                          <Check className="w-3.5 h-3.5 text-[var(--ff-success)]" />
                          <span>{h.title}</span>
                          <span className="text-[10px] text-[var(--ff-text-muted)]">({h.category})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* === FOCUS SESSIONS === */}
                {selectedDay.sessions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                      <span>Focus Sessions ({selectedDay.sessions.length})</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {selectedDay.sessions.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-2.5 rounded-xl border ff-divider bg-[var(--ff-surface-subtle)] text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                            <span className="font-medium capitalize">{s.mode} Session</span>
                          </div>
                          <span className="font-mono font-bold text-[var(--ff-accent-text)]">
                            {Math.round(s.durationSeconds / 60)} mins
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* === GOOGLE CALENDAR EVENTS === */}
                {showGoogleEvents && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5 text-blue-500" />
                      <span>Google Calendar ({selectedDayGoogleEvents.length})</span>
                    </div>

                    {selectedDayGoogleEvents.length === 0 ? (
                      <div className="p-3 text-center rounded-xl border border-dashed ff-divider text-xs text-[var(--ff-text-muted)]">
                        No Google Calendar events scheduled for this date
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {selectedDayGoogleEvents.map((ge) => (
                          <div
                            key={ge.id}
                            className="flex items-start justify-between p-2.5 rounded-xl border ff-divider bg-[var(--ff-surface-subtle)] text-xs"
                          >
                            <div className="flex flex-col gap-1 min-w-0 pr-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-[var(--ff-text-primary)]">
                                  {ge.summary || '(Untitled Event)'}
                                </span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                                    ge.managePolicy === 'focusflow_managed'
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                  }`}
                                >
                                  {ge.managePolicy === 'focusflow_managed' ? 'FocusFlow' : 'Google Read-Only'}
                                </span>
                              </div>
                              {ge.description && (
                                <p className="text-[11px] text-[var(--ff-text-muted)] line-clamp-2">
                                  {ge.description}
                                </p>
                              )}
                              {ge.start.dateTime && (
                                <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                                  {new Date(ge.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {ge.end.dateTime && ` - ${new Date(ge.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                </span>
                              )}
                            </div>
                            {ge.htmlLink && (
                              <a
                                href={ge.htmlLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-medium text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 shrink-0 mt-0.5"
                              >
                                View ↗
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t ff-divider flex justify-end bg-[var(--ff-surface-card)]">
                <ThemeButton variant="secondary" size="sm" onClick={() => setSelectedDateStr(null)}>
                  Close
                </ThemeButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function buildDaySummary(
  dateStr: string,
  dayNumber: number,
  isCurrentMonth: boolean,
  todayStr: string,
  tz: string,
  tasks: Task[],
  bills: Bill[],
  sessions: FocusSession[],
  incomes: IncomeTransaction[],
  expenses: ExpenseTransaction[],
  habits: Habit[]
): DaySummary {
  const dayTasks = tasks.filter((t) => t.dueDate === dateStr || t.dueDate?.slice(0, 10) === dateStr);
  const dayBills = bills.filter((b) => b.dueDate === dateStr || b.dueDate?.slice(0, 10) === dateStr);
  const daySessions = sessions.filter((s) => {
    if (!s.completed) return false;
    const sessionDate = formatDateInTimezone(s.startedAt, tz);
    return sessionDate === dateStr;
  });
  const focusMinutes = Math.round(
    daySessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
  );
  const dayIncomes = incomes.filter((i) => i.date === dateStr || i.date?.slice(0, 10) === dateStr);
  const dayExpenses = expenses.filter((e) => e.date === dateStr || e.date?.slice(0, 10) === dateStr);
  const dayHabits = habits.filter((h) => h.completedDates?.includes(dateStr));

  const incomePaise = dayIncomes.reduce((acc, i) => acc + i.amountPaise, 0);
  const expensePaise = dayExpenses.reduce((acc, e) => acc + e.amountPaise, 0);

  return {
    date: dateStr,
    dayNumber,
    isToday: dateStr === todayStr,
    isCurrentMonth,
    tasks: dayTasks,
    bills: dayBills,
    sessions: daySessions,
    incomes: dayIncomes,
    expenses: dayExpenses,
    habits: dayHabits,
    focusMinutes,
    incomePaise,
    expensePaise,
  };
}
