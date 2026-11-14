import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ProductivityScoreBreakdown } from '../../lib/productivityIntelligence.ts';
import { ThemeCard } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import {
  Award,
  CheckCircle2,
  Clock,
  Flame,
  HelpCircle,
  Sparkles,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';

interface ProductivityScoreCardProps {
  scoreData: ProductivityScoreBreakdown;
  className?: string;
}

export const ProductivityScoreCard: React.FC<ProductivityScoreCardProps> = ({
  scoreData,
  className = '',
}) => {
  const [showFormula, setShowFormula] = useState(false);
  const { isDisabled } = useMotionPreferences();

  const radius = 38;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scoreData.totalScore / 100) * circumference;

  return (
    <ThemeCard variant="interactive" className={`p-5 relative overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: `color-mix(in oklab, ${scoreData.tierColor} 18%, transparent)`,
              color: scoreData.tierColor,
            }}
          >
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-[var(--ff-text-primary)]">
              Daily Productivity Score
            </h3>
            <span className="text-xs text-[var(--ff-text-muted)]">
              Deterministic 0–100 execution index
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFormula((prev) => !prev)}
          className="flex items-center gap-1 text-xs font-medium text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] transition-colors p-1 rounded-md"
          title="Inspect calculation formula"
          aria-expanded={showFormula}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Formula</span>
          {showFormula ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Main Score & Tier Cluster */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 py-2">
        {/* Circular Progress Gauge */}
        <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="var(--ff-surface-subtle)"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Animated Score Arc */}
            <motion.circle
              cx="50"
              cy="50"
              r={radius}
              stroke={scoreData.tierColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              initial={isDisabled ? { strokeDashoffset } : { strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: MOTION_EASING.decelerate }}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          {/* Centered Number & Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black font-mono tracking-tight text-[var(--ff-text-primary)]">
              <AnimatedNumber value={scoreData.totalScore} />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
              / 100
            </span>
          </div>
        </div>

        {/* Tier Info & Components Breakdown */}
        <div className="flex-1 w-full space-y-3">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
              style={{
                backgroundColor: `color-mix(in oklab, ${scoreData.tierColor} 16%, transparent)`,
                color: scoreData.tierColor,
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {scoreData.tier}
            </span>
            <span className="text-xs text-[var(--ff-text-muted)]">
              Updated in real-time
            </span>
          </div>

          {/* Four Weighted Pillar Progress Bars */}
          <div className="space-y-2 text-xs">
            {/* 1. Task Completion (35%) */}
            <div>
              <div className="flex justify-between items-center text-[var(--ff-text-secondary)] mb-1">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Task Completion (35 pts max)
                </span>
                <span className="font-mono font-semibold">
                  {scoreData.taskCompletionPoints} / 35
                </span>
              </div>
              <AnimatedProgressBar
                value={scoreData.taskCompletionPoints}
                max={35}
                customColor="#10b981"
              />
            </div>

            {/* 2. Focus Time Attainment (35%) */}
            <div>
              <div className="flex justify-between items-center text-[var(--ff-text-secondary)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  Focus Time Goal (35 pts max)
                </span>
                <span className="font-mono font-semibold">
                  {scoreData.focusTimePoints} / 35
                </span>
              </div>
              <AnimatedProgressBar
                value={scoreData.focusTimePoints}
                max={35}
                customColor="#6366f1"
              />
            </div>

            {/* 3. Habit Consistency (20%) */}
            <div>
              <div className="flex justify-between items-center text-[var(--ff-text-secondary)] mb-1">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  Habit Consistency (20 pts max)
                </span>
                <span className="font-mono font-semibold">
                  {scoreData.habitConsistencyPoints} / 20
                </span>
              </div>
              <AnimatedProgressBar
                value={scoreData.habitConsistencyPoints}
                max={20}
                customColor="#f59e0b"
              />
            </div>

            {/* 4. Momentum Bonus (10%) */}
            <div>
              <div className="flex justify-between items-center text-[var(--ff-text-secondary)] mb-1">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
                  Daily Targets Bonus (10 pts max)
                </span>
                <span className="font-mono font-semibold">
                  {scoreData.targetBonusPoints} / 10
                </span>
              </div>
              <AnimatedProgressBar
                value={scoreData.targetBonusPoints}
                max={10}
                customColor="#8b5cf6"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Transparent Formula Explanation */}
      <AnimatePresence>
        {showFormula && (
          <motion.div
            initial={isDisabled ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: MOTION_DURATION.card, ease: MOTION_EASING.standard }}
            className="overflow-hidden mt-4 pt-4 border-t border-[var(--ff-border-color)]"
          >
            <div className="p-3 bg-[var(--ff-surface-subtle)] rounded-xl border border-[var(--ff-border-color)] text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--ff-text-primary)]">
                <Info className="w-4 h-4 text-[var(--ff-accent-text)]" />
                Deterministic Scoring Formula Breakdown
              </div>
              <p className="text-[var(--ff-text-muted)] leading-relaxed">
                {scoreData.explanation}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-[var(--ff-surface-card)] p-2 rounded-lg border border-[var(--ff-border-color)]">
                  <div className="text-[var(--ff-text-muted)] text-[10px]">Tasks Done</div>
                  <div className="font-bold text-[var(--ff-text-primary)]">
                    {scoreData.details.tasksCompletedToday} / {scoreData.details.tasksDueToday || 'all'}
                  </div>
                </div>
                <div className="bg-[var(--ff-surface-card)] p-2 rounded-lg border border-[var(--ff-border-color)]">
                  <div className="text-[var(--ff-text-muted)] text-[10px]">Focus Logged</div>
                  <div className="font-bold text-[var(--ff-text-primary)]">
                    {scoreData.details.focusMinutesLogged} / {scoreData.details.focusTargetMinutes}m
                  </div>
                </div>
                <div className="bg-[var(--ff-surface-card)] p-2 rounded-lg border border-[var(--ff-border-color)]">
                  <div className="text-[var(--ff-text-muted)] text-[10px]">Habits Done</div>
                  <div className="font-bold text-[var(--ff-text-primary)]">
                    {scoreData.details.habitsCompletedToday} / {scoreData.details.habitsScheduledToday || 'all'}
                  </div>
                </div>
                <div className="bg-[var(--ff-surface-card)] p-2 rounded-lg border border-[var(--ff-border-color)]">
                  <div className="text-[var(--ff-text-muted)] text-[10px]">Bonus Points</div>
                  <div className="font-bold text-[var(--ff-text-primary)]">
                    +{scoreData.targetBonusPoints} pts
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ThemeCard>
  );
};
