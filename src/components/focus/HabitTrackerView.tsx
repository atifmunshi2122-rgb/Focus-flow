import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Habit } from '../../types/index.ts';
import {
  computeAllHabitsStats,
  computeHabitStreak,
  isHabitScheduledOnDate,
} from '../../lib/productivityIntelligence.ts';
import {
  addDays,
  DEFAULT_TIMEZONE,
  getTodayDateString,
  parseDateString,
} from '../../lib/dateTime.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedCheckmark,
  AnimatedNumber,
  AnimatedProgressBar,
  EmptyStateIllustration,
  MotionStaggerGrid,
  MotionStaggerItem,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import {
  Flame,
  Plus,
  CheckCircle2,
  Calendar,
  Sparkles,
  Trash2,
  Edit2,
  Filter,
  Clock,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';

const CATEGORY_OPTIONS = [
  'General',
  'Health & Fitness',
  'Deep Work',
  'Learning',
  'Mindfulness',
  'Finance',
  'Personal',
];

const COLOR_OPTIONS = [
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#f97316', // Orange
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const HabitTrackerView: React.FC = () => {
  const { refreshKey, triggerRefresh, confirmAction } = useApp();
  const { isDisabled } = useMotionPreferences();

  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'today' | 'completed' | 'pending'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [color, setColor] = useState('#10b981');
  const [frequency, setFrequency] = useState<Habit['frequency']>('daily');
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [reminderTime, setReminderTime] = useState('');
  const [saving, setSaving] = useState(false);

  // Month navigation for matrix heatmap
  const todayStr = useMemo(() => getTodayDateString(DEFAULT_TIMEZONE), []);
  const [matrixMonthOffset, setMatrixMonthOffset] = useState(0);

  const loadHabits = async () => {
    try {
      setLoading(true);
      const list = await api.getHabits();
      setHabits(list);
    } catch (err) {
      console.error('Failed to load habits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHabits();
  }, [refreshKey]);

  const stats = useMemo(() => computeAllHabitsStats(habits, todayStr), [habits, todayStr]);

  const openCreateModal = () => {
    setEditingHabit(null);
    setTitle('');
    setDescription('');
    setCategory('General');
    setColor('#10b981');
    setFrequency('daily');
    setCustomDays([0, 1, 2, 3, 4, 5, 6]);
    setReminderTime('');
    setIsModalOpen(true);
  };

  const openEditModal = (h: Habit) => {
    setEditingHabit(h);
    setTitle(h.title);
    setDescription(h.description || '');
    setCategory(h.category || 'General');
    setColor(h.color || '#10b981');
    setFrequency(h.frequency);
    setCustomDays(h.customDays || [0, 1, 2, 3, 4, 5, 6]);
    setReminderTime(h.reminderTime || '');
    setIsModalOpen(true);
  };

  const handleSaveHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    try {
      if (editingHabit) {
        await api.updateHabit(editingHabit.id, {
          title: title.trim(),
          description: description.trim(),
          category,
          color,
          frequency,
          customDays: frequency === 'custom' ? customDays : [0, 1, 2, 3, 4, 5, 6],
          targetDaysPerWeek: frequency === 'custom' ? customDays.length : 7,
          reminderTime: reminderTime || undefined,
        });
      } else {
        await api.createHabit({
          title: title.trim(),
          description: description.trim(),
          category,
          color,
          frequency,
          customDays: frequency === 'custom' ? customDays : [0, 1, 2, 3, 4, 5, 6],
          targetDaysPerWeek: frequency === 'custom' ? customDays.length : 7,
          completedDates: [],
          bestStreakDays: 0,
          reminderTime: reminderTime || undefined,
        });
      }
      setIsModalOpen(false);
      triggerRefresh();
      await loadHabits();
    } catch (err) {
      console.error('Failed to save habit:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHabit = async (habitId: string, dateStr: string) => {
    // Optimistic UI update
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const set = new Set(h.completedDates || []);
        if (set.has(dateStr)) {
          set.delete(dateStr);
        } else {
          set.add(dateStr);
        }
        const updatedDates = Array.from(set).sort();
        return {
          ...h,
          completedDates: updatedDates,
          bestStreakDays: Math.max(h.bestStreakDays || 0, updatedDates.length),
        };
      })
    );

    try {
      await api.toggleHabit(habitId, dateStr);
      triggerRefresh();
    } catch (err) {
      console.error('Failed to toggle habit:', err);
      await loadHabits(); // revert on failure
    }
  };

  const handleDeleteHabit = async (habitId: string, habitTitle: string) => {
    const confirmed = await confirmAction({
      title: 'Delete Habit',
      message: `Are you sure you want to delete "${habitTitle}"? This can be recovered from the Trash Center.`,
      confirmLabel: 'Delete Habit',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await api.deleteHabit(habitId);
      triggerRefresh();
      await loadHabits();
    } catch (err) {
      console.error('Failed to delete habit:', err);
    }
  };

  const toggleCustomDay = (dayIndex: number) => {
    setCustomDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort()
    );
  };

  // Filtered habits list
  const filteredHabits = useMemo(() => {
    return habits.filter((h) => {
      if (h.deletedAt || h.archived) return false;
      if (filterCategory !== 'all' && h.category !== filterCategory) return false;

      const streak = computeHabitStreak(h, todayStr);
      if (filterStatus === 'today' && !streak.isScheduledToday) return false;
      if (filterStatus === 'completed' && !streak.isCompletedToday) return false;
      if (filterStatus === 'pending' && (streak.isCompletedToday || !streak.isScheduledToday)) {
        return false;
      }
      return true;
    });
  }, [habits, filterCategory, filterStatus, todayStr]);

  // Last 7 days dates for mini-matrix
  const last7Days = useMemo(() => {
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      dates.push(addDays(todayStr, -i));
    }
    return dates;
  }, [todayStr]);

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="ff-heading text-2xl font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <Flame className="w-6 h-6 text-amber-500 animate-pulse" />
            Habits & Daily Streaks
          </h1>
          <p className="text-sm text-[var(--ff-text-muted)] mt-1">
            Build consistency through deterministic habit tracking, streak milestones, and momentum scoring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton
            variant="primary"
            onClick={openCreateModal}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Habit
          </ThemeButton>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <MotionStaggerGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="p-4">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Today's Progress</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
              {stats.completedToday} / {stats.scheduledToday}
            </div>
            <div className="mt-2">
              <AnimatedProgressBar
                value={stats.adherenceRateToday}
                max={100}
                customColor="#10b981"
              />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1.5 block">
              {stats.adherenceRateToday}% adherence today
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="p-4">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Best Active Streak</span>
              <Flame className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)] flex items-center gap-1">
              <AnimatedNumber value={stats.bestCurrentStreak} />
              <span className="text-sm font-sans font-medium text-[var(--ff-text-muted)]">days</span>
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-2 block">
              Longest continuous run
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="p-4">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">7-Day Consistency</span>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
              <AnimatedNumber value={stats.weeklyConsistencyRate} format={(v) => `${v}%`} />
            </div>
            <div className="mt-2">
              <AnimatedProgressBar
                value={stats.weeklyConsistencyRate}
                max={100}
                customColor="#6366f1"
              />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1.5 block">
              Average across all habits
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="p-4">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Active Habits</span>
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
              <AnimatedNumber value={stats.totalActiveHabits} />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-2 block">
              Habits currently tracked
            </span>
          </ThemeCard>
        </MotionStaggerItem>
      </MotionStaggerGrid>

      {/* Filter and View Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--ff-text-muted)] flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </span>
          <div className="flex items-center gap-1 bg-[var(--ff-surface-subtle)] p-0.5 rounded-lg border border-[var(--ff-border-color)]">
            {(['all', 'today', 'pending', 'completed'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterStatus(mode)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  filterStatus === mode
                    ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
                    : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                {mode === 'all' && 'All'}
                {mode === 'today' && 'Due Today'}
                {mode === 'pending' && 'Pending Today'}
                {mode === 'completed' && 'Done Today'}
              </button>
            ))}
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] rounded-lg px-2.5 py-1 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-[var(--ff-text-muted)]">
          Showing <span className="font-semibold text-[var(--ff-text-primary)]">{filteredHabits.length}</span> habit{filteredHabits.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Habits List */}
      {filteredHabits.length === 0 ? (
        <EmptyStateIllustration
          icon={<Flame className="w-10 h-10 text-amber-500" />}
          title="No Habits Found"
          description={
            habits.length === 0
              ? 'Start building positive daily habits. Set schedules, track streaks, and earn consistency scores.'
              : 'No habits match your active filter criteria.'
          }
          action={
            <ThemeButton variant="primary" onClick={openCreateModal}>
              Create First Habit
            </ThemeButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredHabits.map((habit) => {
            const streak = computeHabitStreak(habit, todayStr);
            const isDoneToday = streak.isCompletedToday;
            const isDueToday = streak.isScheduledToday;

            return (
              <ThemeCard
                key={habit.id}
                variant="interactive"
                className="p-5 flex flex-col justify-between relative overflow-hidden group border-l-4"
                style={{
                  borderLeftColor: habit.color || 'var(--ff-accent)',
                }}
              >
                <div>
                  {/* Top Bar: Category badge & Actions */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${habit.color || 'var(--ff-accent)'} 16%, transparent)`,
                          color: habit.color || 'var(--ff-accent)',
                        }}
                      >
                        {habit.category}
                      </span>
                      <span className="text-[11px] text-[var(--ff-text-muted)]">
                        {habit.frequency === 'daily' && 'Daily'}
                        {habit.frequency === 'weekly' && `${habit.targetDaysPerWeek}x / week`}
                        {habit.frequency === 'custom' && 'Custom Days'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEditModal(habit)}
                        className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)]"
                        title="Edit Habit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHabit(habit.id, habit.title)}
                        className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-red-500 hover:bg-red-500/10"
                        title="Delete Habit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Habit Title & Today Checkbox */}
                  <div className="flex items-start justify-between gap-3 mt-1">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base text-[var(--ff-text-primary)] truncate">
                        {habit.title}
                      </h3>
                      {habit.description && (
                        <p className="text-xs text-[var(--ff-text-muted)] line-clamp-1 mt-0.5">
                          {habit.description}
                        </p>
                      )}
                    </div>

                    {/* Quick Today Toggle Button */}
                    <button
                      type="button"
                      data-habit-id={habit.id}
                      onClick={() => handleToggleHabit(habit.id, todayStr)}
                      className={`relative flex items-center justify-center w-10 h-10 rounded-xl border-2 transition-all shrink-0 ${
                        isDoneToday
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                          : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] hover:border-emerald-400 text-[var(--ff-text-muted)]'
                      }`}
                      title={isDoneToday ? 'Completed today! Tap to undo' : 'Mark as completed for today'}
                      aria-label={`Toggle habit ${habit.title}`}
                    >
                      {isDoneToday ? (
                        <Check className="w-5 h-5 stroke-[2.5]" />
                      ) : (
                        <div className="w-3 h-3 rounded-sm border border-current opacity-40" />
                      )}
                    </button>
                  </div>

                  {/* Streak & Consistency Bar */}
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[var(--ff-border-color)]/50">
                    <div className="flex items-center gap-1.5">
                      <Flame
                        className={`w-4 h-4 ${
                          streak.currentStreak > 0 ? 'text-amber-500' : 'text-[var(--ff-text-muted)]'
                        }`}
                      />
                      <span className="text-xs font-bold font-mono text-[var(--ff-text-primary)]">
                        {streak.currentStreak}
                      </span>
                      <span className="text-[11px] text-[var(--ff-text-muted)]">day streak</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-[var(--ff-text-muted)]">
                      <span>Best:</span>
                      <span className="font-semibold text-[var(--ff-text-primary)] font-mono">
                        {streak.longestStreak}d
                      </span>
                    </div>

                    <div className="ml-auto text-[11px] text-[var(--ff-text-muted)]">
                      <span className="font-semibold text-[var(--ff-text-primary)] font-mono">
                        {streak.weeklyCompletionRate}%
                      </span>{' '}
                      consistency
                    </div>
                  </div>

                  {/* 7-Day Mini Dots Matrix */}
                  <div className="mt-3.5">
                    <div className="text-[10px] font-medium text-[var(--ff-text-muted)] mb-1 flex items-center justify-between">
                      <span>Past 7 Days</span>
                      <span>{isDueToday ? (isDoneToday ? 'Done today' : 'Due today') : 'Not scheduled'}</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {last7Days.map((dStr) => {
                        const parsed = parseDateString(dStr);
                        const dayDate = parsed ? new Date(parsed.year, parsed.month - 1, parsed.day) : new Date();
                        const dayLetter = WEEKDAY_SHORT[dayDate.getDay()].slice(0, 1);
                        const isScheduled = isHabitScheduledOnDate(habit, dStr);
                        const isCompleted = (habit.completedDates || []).includes(dStr);
                        const isCurrent = dStr === todayStr;

                        return (
                          <button
                            key={dStr}
                            type="button"
                            onClick={() => handleToggleHabit(habit.id, dStr)}
                            className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg text-[10px] transition-all border ${
                              isCompleted
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-bold'
                                : isScheduled
                                ? 'bg-[var(--ff-surface-subtle)] border-[var(--ff-border-color)] text-[var(--ff-text-muted)]'
                                : 'bg-transparent border-dashed border-[var(--ff-border-color)]/40 text-[var(--ff-text-muted)] opacity-40'
                            } ${isCurrent ? 'ring-1 ring-[var(--ff-accent)]' : ''}`}
                            title={`${dStr}: ${isCompleted ? 'Completed' : isScheduled ? 'Scheduled' : 'Off day'} (Click to toggle)`}
                          >
                            <span className="text-[9px] opacity-75">{dayLetter}</span>
                            <div className="mt-0.5">
                              {isCompleted ? (
                                <Check className="w-3 h-3 stroke-[3]" />
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-current opacity-30" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ThemeCard>
            );
          })}
        </div>
      )}

      {/* Habit Create / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={isDisabled ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              transition={{ duration: MOTION_DURATION.card, ease: MOTION_EASING.standard }}
              className="bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-lg font-bold text-[var(--ff-text-primary)] mb-4 flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500" />
                {editingHabit ? 'Edit Habit' : 'Create New Habit'}
              </h2>

              <form onSubmit={handleSaveHabit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Habit Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Read 20 pages, Morning Run, Deep Work"
                    className="w-full px-3 py-2 text-sm bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ff-accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Description / Goal (Optional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Why this habit matters..."
                    className="w-full px-3 py-2 text-sm bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ff-accent)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                      Frequency
                    </label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as Habit['frequency'])}
                      className="w-full px-3 py-2 text-sm bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl text-[var(--ff-text-primary)] focus:outline-none"
                    >
                      <option value="daily">Daily (Every Day)</option>
                      <option value="custom">Custom Days of Week</option>
                    </select>
                  </div>
                </div>

                {frequency === 'custom' && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1.5">
                      Scheduled Days of Week
                    </label>
                    <div className="grid grid-cols-7 gap-1">
                      {WEEKDAY_SHORT.map((dayName, idx) => {
                        const isSelected = customDays.includes(idx);
                        return (
                          <button
                            key={dayName}
                            type="button"
                            onClick={() => toggleCustomDay(idx)}
                            className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                                : 'bg-[var(--ff-surface-subtle)] border-[var(--ff-border-color)] text-[var(--ff-text-muted)]'
                            }`}
                          >
                            {dayName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1.5">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          color === c ? 'scale-110 ring-2 ring-offset-2 ring-[var(--ff-accent)]' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Select color ${c}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--ff-border-color)]">
                  <ThemeButton
                    type="button"
                    variant="secondary"
                    onClick={() => setIsModalOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </ThemeButton>
                  <ThemeButton
                    type="submit"
                    variant="primary"
                    disabled={saving || !title.trim()}
                  >
                    {saving ? 'Saving...' : editingHabit ? 'Update Habit' : 'Create Habit'}
                  </ThemeButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
