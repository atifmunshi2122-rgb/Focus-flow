import React, { useState, useMemo, useEffect } from 'react';
import { LifeMilestone } from '../../types/features15.ts';
import { useApp } from '../../context/AppContext.tsx';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Calendar,
  Sparkles,
  Heart,
  Plus,
  RotateCcw,
  Info,
  Clock,
  Compass,
} from 'lucide-react';

const DEFAULT_MILESTONES: LifeMilestone[] = [
  { id: 'm-1', label: 'Birth', title: 'Birth', age: 0, weekIndex: 0, category: 'personal', color: '#10b981' },
  { id: 'm-2', label: 'First Day of School', title: 'First Day of School', age: 5, weekIndex: 5 * 52, category: 'education', color: '#38bdf8' },
  { id: 'm-3', label: 'High School & Coding First Principles', title: 'High School & Coding First Principles', age: 15, weekIndex: 15 * 52, category: 'education', color: '#a855f7' },
  { id: 'm-4', label: 'University / Deep Technical Study', title: 'University / Deep Technical Study', age: 18, weekIndex: 18 * 52, category: 'education', color: '#f59e0b' },
  { id: 'm-5', label: 'Career Launch & Financial Independence', title: 'Career Launch & Financial Independence', age: 22, weekIndex: 22 * 52, category: 'career', color: '#ec4899' },
];

export const LifeInWeeksGrid: React.FC = () => {
  const { user } = useApp();
  const activeUid = user?.id || 'usr_guest';
  const birthKey = `focusflow_${activeUid}_life_grid_birth`;
  const milestonesKey = `focusflow_${activeUid}_life_grid_milestones`;

  const [birthDate, setBirthDate] = useState<string>(() => {
    return localStorage.getItem(birthKey) || '2003-01-01';
  });

  const [milestones, setMilestones] = useState<LifeMilestone[]>(() => {
    const saved = localStorage.getItem(milestonesKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fallback
      }
    }
    return DEFAULT_MILESTONES;
  });

  // Switch data cleanly when user changes
  useEffect(() => {
    const savedBirth = localStorage.getItem(birthKey);
    setBirthDate(savedBirth || '2003-01-01');

    const savedMilestones = localStorage.getItem(milestonesKey);
    if (savedMilestones) {
      try {
        const parsed = JSON.parse(savedMilestones);
        if (Array.isArray(parsed)) setMilestones(parsed);
      } catch {}
    } else {
      setMilestones(DEFAULT_MILESTONES);
    }
  }, [birthKey, milestonesKey]);

  const [hoveredWeek, setHoveredWeek] = useState<{ age: number; week: number } | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneAge, setNewMilestoneAge] = useState(25);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleBirthDateChange = (date: string) => {
    setBirthDate(date);
    localStorage.setItem(birthKey, date);
  };

  const saveMilestones = (updated: LifeMilestone[]) => {
    setMilestones(updated);
    localStorage.setItem(milestonesKey, JSON.stringify(updated));
  };

  const stats = useMemo(() => {
    const birth = new Date(birthDate);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - birth.getTime());
    const totalWeeksLived = Math.floor(diffMs / (7 * 86400000));
    const currentAge = Math.floor(totalWeeksLived / 52);
    const currentWeekInYear = totalWeeksLived % 52;
    const total90YearWeeks = 90 * 52; // 4680 weeks
    const remainingWeeks = Math.max(0, total90YearWeeks - totalWeeksLived);
    const percentElapsed = Math.min(100, Math.round((totalWeeksLived / total90YearWeeks) * 100));

    return {
      totalWeeksLived,
      currentAge,
      currentWeekInYear,
      remainingWeeks,
      percentElapsed,
    };
  }, [birthDate]);

  const milestoneMap = useMemo(() => {
    const map = new Map<number, LifeMilestone>();
    for (const m of milestones) {
      map.set(m.age * 52 + (m.weekIndex % 52), m);
    }
    return map;
  }, [milestones]);

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneTitle.trim()) return;

    const newM: LifeMilestone = {
      id: `m-${Date.now()}`,
      label: newMilestoneTitle.trim(),
      title: newMilestoneTitle.trim(),
      age: newMilestoneAge,
      weekIndex: newMilestoneAge * 52,
      category: 'personal',
      color: '#f59e0b',
    };

    saveMilestones([...milestones, newM]);
    setNewMilestoneTitle('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Compass className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">Life in Weeks (Memento Mori)</h2>
            <ThemeBadge tone="accent">90-Year Horizon</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Every square represents one single week of your life. Make each one count intentionally.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[var(--ff-surface-muted)] px-3 py-1.5 rounded-xl border border-[var(--ff-border)] text-xs">
            <Calendar className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
            <span className="text-[var(--ff-text-muted)]">Birth:</span>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => handleBirthDateChange(e.target.value)}
              className="bg-transparent border-none text-[var(--ff-text-primary)] font-bold text-xs focus:outline-none"
            />
          </div>

          <ThemeButton variant="secondary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Milestone
          </ThemeButton>
        </div>
      </div>

      {/* Perspective Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <span className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider block">
            Current Age
          </span>
          <span className="text-xl font-bold text-[var(--ff-text-primary)] mt-0.5 block font-mono">
            {stats.currentAge}y {stats.currentWeekInYear}w
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <span className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider block">
            Weeks Completed
          </span>
          <span className="text-xl font-bold text-sky-400 mt-0.5 block font-mono">
            {stats.totalWeeksLived.toLocaleString()}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <span className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider block">
            Weeks Remaining (90y)
          </span>
          <span className="text-xl font-bold text-amber-400 mt-0.5 block font-mono">
            {stats.remainingWeeks.toLocaleString()}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <span className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider block">
            Life Expended
          </span>
          <span className="text-xl font-bold text-[var(--ff-text-primary)] mt-0.5 block font-mono">
            {stats.percentElapsed}%
          </span>
        </div>
      </div>

      {/* 90-Year Life Grid View */}
      <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-3 overflow-x-auto">
        <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
          <span>90 Years (Rows: Ages 0 to 89 • Columns: 52 Weeks per Year)</span>
          {hoveredWeek && (
            <span className="font-mono text-[var(--ff-accent-text)] font-bold">
              Age {hoveredWeek.age}, Week {hoveredWeek.week + 1}
            </span>
          )}
        </div>

        <div className="min-w-[680px] space-y-1 select-none">
          {Array.from({ length: 90 }).map((_, age) => {
            const isMilestoneRow = milestones.some((m) => m.age === age);

            return (
              <div key={age} className="flex items-center gap-1.5">
                <span className="w-8 text-[10px] text-[var(--ff-text-muted)] font-mono text-right shrink-0">
                  {age % 5 === 0 ? `${age}` : ''}
                </span>

                <div className="flex items-center gap-1">
                  {Array.from({ length: 52 }).map((_, week) => {
                    const totalWeekIndex = age * 52 + week;
                    const isLived = totalWeekIndex < stats.totalWeeksLived;
                    const isCurrent = totalWeekIndex === stats.totalWeeksLived;
                    const milestone = milestoneMap.get(totalWeekIndex);

                    let bg = 'bg-[var(--ff-surface-muted)]/40 hover:bg-[var(--ff-surface-muted)]';
                    let border = 'border-transparent';

                    if (isLived) {
                      bg = 'bg-slate-500/50 hover:bg-slate-400';
                    }
                    if (isCurrent) {
                      bg = 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse';
                    }
                    if (milestone) {
                      bg = milestone.color || '#f59e0b';
                      border = 'border-white/50';
                    }

                    return (
                      <div
                        key={week}
                        onMouseEnter={() => setHoveredWeek({ age, week })}
                        onMouseLeave={() => setHoveredWeek(null)}
                        title={
                          milestone
                            ? `⭐ Milestone: ${milestone.title} (Age ${age})`
                            : isCurrent
                            ? `📍 You are here! (Age ${age}, Week ${week + 1})`
                            : isLived
                            ? `Lived: Age ${age}, Week ${week + 1}`
                            : `Future: Age ${age}, Week ${week + 1}`
                        }
                        style={{ backgroundColor: milestone ? milestone.color : undefined }}
                        className={`w-2.5 h-2.5 rounded-sm transition-transform hover:scale-150 cursor-pointer border ${bg} ${border}`}
                      />
                    );
                  })}
                </div>

                {isMilestoneRow && (
                  <span className="text-[10px] text-amber-400 font-medium truncate max-w-[150px] pl-1">
                    {milestones.filter((m) => m.age === age).map((m) => m.title).join(', ')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Milestone Legend & List */}
      <div className="p-4 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-2">
        <span className="text-xs font-bold text-[var(--ff-text-primary)] block">Life Milestones Timeline</span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {milestones.map((m) => (
            <div
              key={m.id}
              className="px-2.5 py-1 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] flex items-center gap-1.5"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color || '#38bdf8' }} />
              <span className="font-bold text-[var(--ff-text-primary)]">{m.title}</span>
              <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">(Age {m.age})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Milestone Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Add Life Milestone</h3>

            <form onSubmit={handleAddMilestone} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Milestone Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mastered Deep Learning / Moved to City"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
                />
              </div>

              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Target Age (Years)</label>
                <input
                  type="number"
                  min="0"
                  max="89"
                  value={newMilestoneAge}
                  onChange={(e) => setNewMilestoneAge(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border)]">
                <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </ThemeButton>
                <ThemeButton type="submit" variant="primary" size="sm">
                  Save Milestone
                </ThemeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
