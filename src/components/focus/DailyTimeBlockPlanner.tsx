import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { TimeBlock, Task } from '../../types/index.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import { ThemeCard, ThemeButton, ThemeInput, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { getSpringTransition, MOTION_DURATION } from '../../theme/motionTokens.ts';
import {
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit2,
  GripVertical,
  BookOpen,
} from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  Focus: '#6366f1',
  Work: '#0ea5e9',
  Health: '#10b981',
  Personal: '#f59e0b',
  Learning: '#8b5cf6',
  Finance: '#ec4899',
};

export const DailyTimeBlockPlanner: React.FC = () => {
  const { settings, showToast, refreshKey, triggerRefresh, confirmAction, setCurrentTab } = useApp();
  const { intensity, isDisabled } = useMotionPreferences();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Focus');
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:00');
  const [formTaskId, setFormTaskId] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([api.getTimeBlocks(selectedDate), api.getTasks()])
      .then(([b, t]) => {
        if (!isMounted) return;
        setBlocks(b);
        setTasks(t.filter((item) => !item.deletedAt));
      })
      .catch((err) => {
        if (isMounted) showToast('Failed to load daily schedule', 'error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDate, refreshKey, showToast]);

  const openCreateModal = (startTime = '09:00') => {
    setEditingBlock(null);
    setFormTitle('');
    setFormCategory('Focus');
    setFormStartTime(startTime);
    // End time 1 hour later
    const [h, m] = startTime.split(':').map(Number);
    const endH = Math.min(23, h + 1);
    setFormEndTime(`${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    setFormTaskId('');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (b: TimeBlock) => {
    setEditingBlock(b);
    setFormTitle(b.title);
    setFormCategory(b.category);
    setFormStartTime(minutesToTimeString(b.startMinute));
    setFormEndTime(minutesToTimeString(b.endMinute));
    setFormTaskId(b.taskId || '');
    setFormNotes(b.notes || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Please enter a block title', 'error');
      return;
    }

    const startMinute = timeStringToMinutes(formStartTime);
    const endMinute = timeStringToMinutes(formEndTime);

    if (endMinute <= startMinute) {
      showToast('End time must be after start time', 'error');
      return;
    }

    try {
      if (editingBlock) {
        await api.updateTimeBlock(editingBlock.id, {
          title: formTitle.trim(),
          date: selectedDate,
          category: formCategory,
          startMinute,
          endMinute,
          taskId: formTaskId || null,
          notes: formNotes,
          revisionId: editingBlock.revisionId || null,
        });
        showToast('Time block updated', 'success');
      } else {
        await api.createTimeBlock({
          title: formTitle.trim(),
          date: selectedDate,
          category: formCategory,
          startMinute,
          endMinute,
          taskId: formTaskId || null,
          completed: false,
          notes: formNotes,
        });
        showToast('Time block scheduled', 'success');
      }
      setIsModalOpen(false);
      triggerRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save time block';
      showToast(msg, 'error');
    }
  };

  const handleToggleComplete = async (block: TimeBlock) => {
    try {
      await api.updateTimeBlock(block.id, {
        completed: !block.completed,
      });
      triggerRefresh();
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const handleDelete = async (block: TimeBlock) => {
    const confirmed = await confirmAction({
      title: 'Delete Time Block',
      message: 'Move this scheduled time block to Trash? You can restore it later from the Trash Bin.',
      itemLabel: `${block.title} (${minutesToTimeString(block.startMinute)}–${minutesToTimeString(block.endMinute)})`,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteTimeBlock(block.id);
      showToast('Time block moved to trash', 'info');
      triggerRefresh();
    } catch {
      showToast('Failed to delete time block', 'error');
    }
  };

  const handlePrevDay = () => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Detect overlapping blocks
  const conflictingBlockIds = useMemo(() => {
    const conflicts = new Set<string>();
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        // Overlap if max(start) < min(end)
        if (Math.max(a.startMinute, b.startMinute) < Math.min(a.endMinute, b.endMinute)) {
          conflicts.add(a.id);
          conflicts.add(b.id);
        }
      }
    }
    return conflicts;
  }, [blocks]);

  // Timeline hours from 06:00 to 23:00 (18 hours)
  const timelineHours = Array.from({ length: 18 }, (_, i) => i + 6);

  const totalPlannedMinutes = blocks.reduce((sum, b) => sum + (b.endMinute - b.startMinute), 0);
  const completedMinutes = blocks
    .filter((b) => b.completed)
    .reduce((sum, b) => sum + (b.endMinute - b.startMinute), 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
              Daily Time-block Planner
            </h1>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Schedule your day intentionally with dedicated time chunk reservations
            </p>
          </div>
        </div>

        {/* Date Controls & Add Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[var(--ff-card-bg)] border ff-divider rounded-lg p-1">
            <ThemeButton variant="ghost" size="sm" onClick={handlePrevDay} aria-label="Previous day" className="p-1.5">
              <ChevronLeft className="w-4 h-4" />
            </ThemeButton>
            <span className="text-xs font-bold font-mono px-3 min-w-[110px] text-center text-[var(--ff-text-primary)]">
              {selectedDate === todayStr ? 'Today' : selectedDate}
            </span>
            <ThemeButton variant="ghost" size="sm" onClick={handleNextDay} aria-label="Next day" className="p-1.5">
              <ChevronRight className="w-4 h-4" />
            </ThemeButton>
          </div>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setSelectedDate(todayStr)}
            disabled={selectedDate === todayStr}
          >
            Today
          </ThemeButton>

          <ThemeButton variant="primary" size="sm" onClick={() => openCreateModal()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Block
          </ThemeButton>
        </div>
      </div>

      {/* Daily Progress Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Planned Time</span>
            <p className="text-lg font-bold font-mono text-[var(--ff-text-primary)] mt-0.5">
              {Math.floor(totalPlannedMinutes / 60)}h {totalPlannedMinutes % 60}m
            </p>
          </div>
          <ThemeBadge tone="neutral">{blocks.length} blocks</ThemeBadge>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Completed Time</span>
            <p className="text-lg font-bold font-mono text-[var(--ff-success)] mt-0.5">
              {Math.floor(completedMinutes / 60)}h {completedMinutes % 60}m
            </p>
          </div>
          <ThemeBadge tone="neutral">
            {totalPlannedMinutes > 0 ? Math.round((completedMinutes / totalPlannedMinutes) * 100) : 0}% Done
          </ThemeBadge>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Conflicts</span>
            <p className="text-lg font-bold font-mono mt-0.5" style={{ color: conflictingBlockIds.size > 0 ? 'var(--ff-danger)' : 'var(--ff-success)' }}>
              {conflictingBlockIds.size > 0 ? `${conflictingBlockIds.size} Overlaps` : '0 Clean'}
            </p>
          </div>
          {conflictingBlockIds.size > 0 && <AlertTriangle className="w-5 h-5 text-[var(--ff-danger)]" />}
        </div>
      </div>

      {/* Visual Hourly Timeline */}
      <ThemeCard noPadding className="overflow-hidden">
        <div className="divide-y ff-divider">
          {timelineHours.map((hour) => {
            const hourStartMin = hour * 60;
            const hourEndMin = (hour + 1) * 60;
            const hourStr = `${String(hour).padStart(2, '0')}:00`;

            const activeInHour = blocks.filter(
              (b) => b.startMinute < hourEndMin && b.endMinute > hourStartMin
            );

            const currentHour = new Date().getHours();
            const isCurrentHour = selectedDate === todayStr && hour === currentHour;
            const currentMinutePercent = Math.round((new Date().getMinutes() / 60) * 100);

            return (
              <div
                key={hour}
                className="relative flex items-start min-h-[72px] transition-colors hover:bg-[var(--ff-muted)]/10"
              >
                {/* Real-time Current Hour Indicator Line */}
                {isCurrentHour && (
                  <div
                    className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                    style={{ top: `${currentMinutePercent}%` }}
                    aria-hidden="true"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--ff-danger)] -ml-1 shadow-[0_0_8px_var(--ff-danger)]" />
                    <div className="flex-1 h-0.5 bg-[var(--ff-danger)] opacity-85" />
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--ff-danger)] text-white mr-2">
                      NOW
                    </span>
                  </div>
                )}
                {/* Hour Label */}
                <div className="w-20 sm:w-24 shrink-0 px-4 py-3 text-xs font-mono font-bold text-[var(--ff-text-muted)] border-r ff-divider">
                  {hourStr}
                </div>

                {/* Slot Area */}
                <div className="flex-1 p-2 flex flex-wrap gap-2 items-center">
                  {activeInHour.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => openCreateModal(hourStr)}
                      className="opacity-75 sm:opacity-0 sm:hover:opacity-100 text-[11px] text-[var(--ff-text-muted)] hover:text-[var(--ff-accent)] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--ff-border-color)] sm:border-transparent hover:border-[var(--ff-accent-border)] transition-all min-h-[36px]"
                    >
                      <Plus className="w-3.5 h-3.5" /> Schedule {hourStr}
                    </button>
                  ) : (
                    activeInHour.map((b) => {
                      const isConflicted = conflictingBlockIds.has(b.id);
                      const catColor = CATEGORY_COLORS[b.category] || '#6366f1';

                      return (
                        <div
                          key={b.id}
                          className={`flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl border transition-all ${
                            b.completed
                              ? 'bg-[var(--ff-card-bg)] opacity-60 border-[var(--ff-border)]'
                              : 'bg-[var(--ff-card-bg)] shadow-xs'
                          }`}
                          style={{
                            borderLeftWidth: '4px',
                            borderLeftColor: isConflicted ? 'var(--ff-danger)' : catColor,
                            borderColor: isConflicted ? 'var(--ff-danger)' : undefined,
                          }}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {/* Dedicated Drag Handle for Touch Ergonomics */}
                            <div
                              className="text-[var(--ff-text-muted)] opacity-60 hover:opacity-100 cursor-grab active:cursor-grabbing p-1 shrink-0"
                              style={{ touchAction: 'none' }}
                              title="Drag handle"
                              aria-hidden="true"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleComplete(b)}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--ff-text-muted)] hover:text-[var(--ff-success)] shrink-0"
                              aria-label={b.completed ? 'Mark incomplete' : 'Mark completed'}
                            >
                              {b.completed ? (
                                <CheckCircle2 className="w-4 h-4 text-[var(--ff-success)]" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </button>

                            {/* Tap to edit block body */}
                            <div
                              onClick={() => openEditModal(b)}
                              className="cursor-pointer min-w-0 pr-1 select-none"
                              title="Tap to edit this block"
                            >
                              <p
                                className={`text-xs font-bold text-[var(--ff-text-primary)] truncate ${
                                  b.completed ? 'line-through' : ''
                                }`}
                              >
                                {b.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-[var(--ff-text-muted)] font-mono">
                                <span>
                                  {minutesToTimeString(b.startMinute)} – {minutesToTimeString(b.endMinute)}
                                </span>
                                <span>•</span>
                                <span style={{ color: catColor }} className="font-semibold">
                                  {b.category}
                                </span>
                                {b.revisionId && (
                                  <>
                                    <span>•</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentTab('study');
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 border border-indigo-500/25 transition-colors cursor-pointer"
                                      title="Linked Spaced Revision. Click to view in Study OS."
                                    >
                                      <BookOpen className="w-3 h-3" />
                                      <span>Revision</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0 ml-2">
                            {isConflicted && (
                              <span title="Overlaps with another block" className="p-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-[var(--ff-danger)]" />
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditModal(b)}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                              aria-label="Edit time block"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(b)}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                              aria-label="Delete time block"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ThemeCard>

      {/* Add / Edit Time Block Modal (Bottom-Sheet on Mobile) */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={isDisabled ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: MOTION_DURATION.card }}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.form
              onSubmit={handleSave}
              initial={isDisabled ? false : { opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={isDisabled ? undefined : { opacity: 0, y: 20, scale: 0.98 }}
              transition={getSpringTransition(intensity, isDisabled)}
              className="relative z-10 w-full max-w-md bg-[var(--ff-card-bg)] border ff-divider rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              {/* Mobile Grab Handle */}
              <div className="sm:hidden w-12 h-1 bg-[var(--ff-border-strong)] rounded-full mx-auto mt-2.5 opacity-60 shrink-0" />

              <div className="flex items-center justify-between px-6 py-4 border-b ff-divider">
                <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                  {editingBlock ? 'Edit Time Block' : 'Schedule Time Block'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                  aria-label="Close dialog"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Block Title
                  </label>
                  <ThemeInput
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Deep Focus: Q4 Financial Review"
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                      Start Time
                    </label>
                    <ThemeInput
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                      End Time
                    </label>
                    <ThemeInput
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="ff-input w-full text-xs py-2 px-3 rounded-lg"
                    style={{
                      backgroundColor: 'var(--ff-card-bg)',
                      borderColor: 'var(--ff-border)',
                      color: 'var(--ff-text-primary)',
                    }}
                  >
                    {Object.keys(CATEGORY_COLORS).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Link Existing Task (Optional)
                  </label>
                  <select
                    value={formTaskId}
                    onChange={(e) => setFormTaskId(e.target.value)}
                    className="ff-input w-full text-xs py-2 px-3 rounded-lg"
                    style={{
                      backgroundColor: 'var(--ff-card-bg)',
                      borderColor: 'var(--ff-border)',
                      color: 'var(--ff-text-primary)',
                    }}
                  >
                    <option value="">-- No Linked Task --</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Notes
                  </label>
                  <ThemeInput
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Goals or agenda for this session"
                  />
                </div>
              </div>

              <div className="p-4 border-t ff-divider flex items-center justify-end gap-2">
                <ThemeButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[44px] px-4 font-semibold"
                >
                  Cancel
                </ThemeButton>
                <ThemeButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="min-h-[44px] px-4 font-semibold"
                >
                  {editingBlock ? 'Save Changes' : 'Schedule Block'}
                </ThemeButton>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function minutesToTimeString(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
