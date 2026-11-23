import React, { useMemo } from 'react';
import { Habit } from '../../../../types/index.ts';
import { computeHabitStreak } from '../../../../lib/productivityIntelligence.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { Flame } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface HabitStreakLongevityChartProps {
  habits: Habit[];
  onExpand?: () => void;
}

export const HabitStreakLongevityChart: React.FC<HabitStreakLongevityChartProps> = ({
  habits,
  onExpand,
}) => {
  const streakData = useMemo(() => {
    return habits
      .filter((h) => !h.archived && !h.deletedAt)
      .map((h) => {
        const streakInfo = computeHabitStreak(h);
        const bestStreak = Math.max(h.bestStreakDays || 0, streakInfo.longestStreak, streakInfo.currentStreak);
        return {
          id: h.id,
          title: h.title,
          currentStreak: streakInfo.currentStreak,
          bestStreak,
          totalCompletions: streakInfo.totalCompletions,
          color: h.color || 'var(--ff-warning)',
        };
      })
      .sort((a, b) => b.currentStreak - a.currentStreak);
  }, [habits]);

  const maxStreak = Math.max(10, ...streakData.map((s) => s.bestStreak));

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'habit_streak_longevity',
      ['HabitTitle', 'CurrentStreakDays', 'BestStreakDays', 'TotalCompletions'],
      streakData.map((s) => [s.title, s.currentStreak, s.bestStreak, s.totalCompletions])
    );
  };

  return (
    <GraphCard
      id="habit-streak-longevity"
      title="Streak Longevity & Historical Records"
      subtitle="Current consecutive active days vs all-time best streak"
      domain="habits"
      icon={<Flame className="w-4 h-4 text-amber-500" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={streakData.length === 0}
      legend={[
        { label: 'Current Streak', color: 'var(--ff-warning)' },
        { label: 'All-Time Record', color: 'var(--ff-border-color)', isDashed: true },
      ]}
    >
      <div className="space-y-3.5 pt-1">
        {streakData.slice(0, 6).map((item) => (
          <div
            key={item.id}
            className="p-2.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--ff-text-primary)] truncate max-w-[200px]">
                {item.title}
              </span>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="font-bold text-amber-400">{item.currentStreak}d current</span>
                <span className="text-[var(--ff-text-muted)]">/ {item.bestStreak}d best</span>
              </div>
            </div>

            {/* Range bar */}
            <div className="relative w-full bg-[var(--ff-border-color)]/30 h-2 rounded-full overflow-hidden">
              {/* Best streak background track */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-[var(--ff-border-color)] rounded-full"
                style={{ width: `${Math.min(100, (item.bestStreak / maxStreak) * 100)}%` }}
              />
              {/* Current streak active fill */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (item.currentStreak / maxStreak) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
