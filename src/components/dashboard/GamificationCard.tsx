import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Flame, ShieldCheck, Target, Trophy } from 'lucide-react';
import {
  Bill,
  FocusSession,
  SavingsGoal,
  Task,
} from '../../types/index.ts';
import { useApp } from '../../context/AppContext.tsx';
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
  rpgOverride?: {
    level: number;
    rankTitle: string;
    totalXP: number;
    currentLevelXP: number;
    nextLevelXP: number;
    progressPercent: number;
  } | null;
  compact?: boolean;
  className?: string;
}

export const GamificationCard: React.FC<GamificationCardProps> = ({
  sessions,
  tasks,
  bills,
  savingsGoals,
  focusStreakDays,
  bestStreakDays,
  dailyFocusGoalMinutes,
  rpgOverride = null,
  compact = false,
  className = '',
}) => {
  const { settings } = useApp();
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
        timezone: settings?.timezone,
      }),
    [sessions, tasks, bills, savingsGoals, focusStreakDays, bestStreakDays, dailyFocusGoalMinutes, settings?.timezone]
  );

  const visibleBadges = showAllBadges ? summary.badges : summary.badges.slice(0, 6);

  const displayLevel = rpgOverride ? rpgOverride.level : summary.level;
  const displayRankTitle = rpgOverride ? rpgOverride.rankTitle : summary.rankTitle;
  const displayXP = rpgOverride ? rpgOverride.totalXP : summary.xp;
  const displayCurrentLevelXP = rpgOverride ? rpgOverride.currentLevelXP : summary.currentLevelXp;
  const displayNextLevelXP = rpgOverride ? rpgOverride.nextLevelXP : summary.nextLevelXp;
  const displayProgressPct = rpgOverride ? rpgOverride.progressPercent : summary.levelProgressPercent;

  return (
    <InteractiveSurface3D maxTilt={1.5} className={`h-full ${className}`}>
      <ThemeCard className="space-y-4 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={isDisabled ? undefined : { scale: 1.05 }}
            transition={{ duration: 0.2 }}
            className="w-9 h-9 flex items-center justify-center shrink-0 border"
            style={{
              borderRadius: 'var(--ff-radius-button)',
              background: 'var(--ff-accent-soft)',
              borderColor: 'var(--ff-accent-border)',
              color: 'var(--ff-accent-text)',
            }}
          >
            <Trophy className="w-4 h-4" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)] leading-snug break-words">
                Level {displayLevel} · {displayRankTitle}
              </h3>
              <ThemeBadge tone="accent">
                <AnimatedNumber value={displayXP} /> XP
              </ThemeBadge>
            </div>
            <p className="text-xs text-[var(--ff-text-muted)] whitespace-normal break-words leading-snug mt-0.5">
              Rule-based milestones • {summary.earnedCount}/{summary.badges.length} badges unlocked
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--ff-warning-soft)] text-[var(--ff-warning)] font-semibold whitespace-nowrap">
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span>Best Streak: {summary.records.bestStreakDays}d</span>
          </div>
          <div
            className="hidden sm:flex items-center gap-1 text-[11px] text-[var(--ff-text-muted)] whitespace-nowrap"
            title="Missing a day never erases your XP, badges, or best streak record"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--ff-success)] shrink-0" />
            <span>Non-punitive</span>
          </div>
        </div>
      </div>

      {/* Level XP Progress */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--ff-text-muted)] mb-1">
          <span>Level Progress</span>
          <span className="font-mono whitespace-nowrap tabular-nums">
            {displayCurrentLevelXP} / {displayNextLevelXP} XP ({displayProgressPct}%)
          </span>
        </div>
        <AnimatedProgressBar
          value={displayProgressPct}
          showShimmer={true}
          heightClass="h-2"
          ariaLabel="Level XP Progress"
        />
      </div>

      {!compact && (
        <div className="space-y-4 pt-1 min-w-0">
          {/* Daily & Weekly Challenges */}
          <div className="space-y-2 min-w-0">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 shrink-0" />
              <span>Active Challenges</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {summary.challenges.map((ch) => (
                <div
                  key={ch.id}
                  title={`${ch.title} (${ch.progress}/${ch.target} ${ch.unit})`}
                  className="ff-surface-subtle p-3 min-w-0 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between text-xs gap-2.5 min-w-0">
                    <span className="font-semibold text-[var(--ff-text-primary)] min-w-0 flex-1 whitespace-normal break-words leading-snug">
                      {ch.title}
                    </span>
                    <span
                      className="font-mono text-[11px] shrink-0 whitespace-nowrap font-semibold tabular-nums"
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
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 shrink-0" />
                <span>Achievement Badges</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowAllBadges((v) => !v)}
                className="text-[11px] font-semibold text-[var(--ff-accent-text)] hover:underline shrink-0"
              >
                {showAllBadges ? 'Show Fewer' : `View All (${summary.badges.length})`}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <AnimatePresence mode="popLayout">
                {visibleBadges.map((b) => (
                  <motion.div
                    key={b.id}
                    layout
                    initial={isDisabled ? false : { opacity: 0, scale: 0.96, y: 6 }}
                    animate={{ opacity: b.earned ? 1 : 0.78, scale: 1, y: 0 }}
                    exit={isDisabled ? undefined : { opacity: 0, scale: 0.96, y: 6 }}
                    whileHover={isDisabled ? undefined : { y: -1 }}
                    whileTap={isDisabled ? undefined : { scale: 0.99 }}
                    transition={getSpringTransition(intensity, isDisabled)}
                    title={`${b.title}: ${b.description} (${b.earned ? 'Unlocked' : `${b.progress}/${b.target}`})`}
                    className="p-3 border transition-shadow cursor-default min-w-0 flex flex-col justify-between gap-1.5"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      borderColor: b.earned ? 'var(--ff-accent-border)' : 'var(--ff-border-color)',
                      background: b.earned ? 'var(--ff-accent-soft)' : 'var(--ff-surface-subtle)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <span className="text-xs font-bold text-[var(--ff-text-primary)] min-w-0 flex-1 whitespace-normal break-words leading-snug">
                        {b.title}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[var(--ff-accent-text)] shrink-0 whitespace-nowrap flex items-center gap-1 pt-0.5 tabular-nums">
                        {b.earned && (
                          <motion.span
                            initial={isDisabled ? false : { scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                            className="w-1.5 h-1.5 rounded-full bg-[var(--ff-success)] inline-block shrink-0"
                          />
                        )}
                        {b.earned ? 'UNLOCKED' : `${b.progress}/${b.target}`}
                      </span>
                    </div>
                    <p
                      title={b.description}
                      className="text-[11px] text-[var(--ff-text-muted)] leading-relaxed whitespace-normal break-words line-clamp-2"
                    >
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
