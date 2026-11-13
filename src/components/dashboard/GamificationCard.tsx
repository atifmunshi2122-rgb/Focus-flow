import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Flame, ShieldCheck, Target, Trophy } from 'lucide-react';
import {
  Bill,
  FocusSession,
  SavingsGoal,
  Task,
} from '../../types/index.ts';
import { computeGamificationState } from '../../lib/gamificationEngine.ts';
import { ThemeBadge, ThemeCard } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  InteractiveSurface3D,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { getSpringTransition } from '../../theme/motionTokens.ts';

interface GamificationCardProps {
  sessions: FocusSession[];
  tasks: Task[];
  bills: Bill[];
  savingsGoals: SavingsGoal[];
  focusStreakDays: number;
  bestStreakDays?: number;
  dailyFocusGoalMinutes?: number;
  compact?: boolean;
}

export const GamificationCard: React.FC<GamificationCardProps> = ({
  sessions,
  tasks,
  bills,
  savingsGoals,
  focusStreakDays,
  bestStreakDays,
  dailyFocusGoalMinutes,
  compact = false,
}) => {
  const [showAllBadges, setShowAllBadges] = useState(false);
  const { intensity, isDisabled } = useMotionPreferences();

  const summary = useMemo(
    () =>
      computeGamificationState({
        sessions,
        tasks,
        bills,
        savingsGoals,
        focusStreakDays,
        bestStreakDays,
        dailyFocusGoalMinutes,
      }),
    [sessions, tasks, bills, savingsGoals, focusStreakDays, bestStreakDays, dailyFocusGoalMinutes]
  );

  const visibleBadges = showAllBadges ? summary.badges : summary.badges.slice(0, 6);

  return (
    <InteractiveSurface3D maxTilt={2.5}>
      <ThemeCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={isDisabled ? undefined : { scale: 1.08, rotate: [0, -6, 6, 0] }}
            transition={{ duration: 0.3 }}
            className="w-10 h-10 flex items-center justify-center shrink-0"
            style={{
              borderRadius: 'var(--ff-radius-button)',
              background: 'linear-gradient(135deg, var(--ff-accent), var(--ff-accent-secondary))',
              color: 'var(--ff-accent-contrast)',
              boxShadow: isDisabled
                ? undefined
                : '0 0 16px color-mix(in oklab, var(--ff-accent) 45%, transparent)',
            }}
          >
            <Trophy className="w-5 h-5" />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Level {summary.level} · {summary.rankTitle}
              </h3>
              <ThemeBadge tone="accent">
                <AnimatedNumber value={summary.xp} /> XP
              </ThemeBadge>
            </div>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Rule-based milestones • {summary.earnedCount}/{summary.badges.length} badges unlocked
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--ff-warning-soft)] text-[var(--ff-warning)] font-semibold">
            <Flame className="w-3.5 h-3.5" />
            <span>Best Streak: {summary.records.bestStreakDays}d</span>
          </div>
          <div
            className="hidden sm:flex items-center gap-1 text-[11px] text-[var(--ff-text-muted)]"
            title="Missing a day never erases your XP, badges, or best streak record"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--ff-success)]" />
            <span>Non-punitive</span>
          </div>
        </div>
      </div>

      {/* Level XP Progress */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)] mb-1">
          <span>Level Progress</span>
          <span className="font-mono">
            {summary.currentLevelXp} / {summary.nextLevelXp} XP ({summary.levelProgressPercent}%)
          </span>
        </div>
        <AnimatedProgressBar
          value={summary.levelProgressPercent}
          showShimmer={true}
          heightClass="h-2"
          ariaLabel="Level XP Progress"
        />
      </div>

      {!compact && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          {/* Daily & Weekly Challenges */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Active Challenges
            </h4>
            <div className="space-y-2">
              {summary.challenges.map((ch) => (
                <div key={ch.id} className="ff-surface-subtle p-2.5">
                  <div className="flex items-center justify-between text-xs gap-2 mb-1">
                    <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                      {ch.title}
                    </span>
                    <span
                      className="font-mono text-[11px] shrink-0 font-semibold"
                      style={{ color: ch.completed ? 'var(--ff-success)' : 'var(--ff-accent-text)' }}
                    >
                      {ch.progress}/{ch.target} {ch.unit}
                    </span>
                  </div>
                  <AnimatedProgressBar
                    value={ch.progress}
                    max={ch.target}
                    heightClass="h-1.5"
                    tone={ch.completed ? 'success' : 'accent'}
                    ariaLabel={`${ch.title} progress`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Achievements Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" /> Achievement Badges
              </h4>
              <button
                type="button"
                onClick={() => setShowAllBadges((v) => !v)}
                className="text-[11px] font-semibold text-[var(--ff-accent-text)] hover:underline"
              >
                {showAllBadges ? 'Show Fewer' : `View All (${summary.badges.length})`}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <AnimatePresence mode="popLayout">
                {visibleBadges.map((b) => (
                  <motion.div
                    key={b.id}
                    layout
                    initial={isDisabled ? false : { opacity: 0, scale: 0.94, y: 6 }}
                    animate={{ opacity: b.earned ? 1 : 0.72, scale: 1, y: 0 }}
                    exit={isDisabled ? undefined : { opacity: 0, scale: 0.94, y: 6 }}
                    whileHover={isDisabled ? undefined : { y: -2, scale: 1.02 }}
                    whileTap={isDisabled ? undefined : { scale: 0.98 }}
                    transition={getSpringTransition(intensity, isDisabled)}
                    className="p-2.5 border transition-shadow cursor-default"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      borderColor: b.earned ? 'var(--ff-accent-border)' : 'var(--ff-border-color)',
                      background: b.earned ? 'var(--ff-accent-soft)' : 'var(--ff-surface-subtle)',
                      boxShadow:
                        b.earned && !isDisabled
                          ? '0 0 12px color-mix(in oklab, var(--ff-accent) 25%, transparent)'
                          : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                        {b.title}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--ff-accent-text)] shrink-0 flex items-center gap-1">
                        {b.earned && (
                          <motion.span
                            initial={isDisabled ? false : { scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                            className="w-1.5 h-1.5 rounded-full bg-[var(--ff-success)] inline-block"
                          />
                        )}
                        {b.earned ? 'UNLOCKED' : `${b.progress}/${b.target}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5 line-clamp-1">
                      {b.description}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
      </ThemeCard>
    </InteractiveSurface3D>
  );
};
