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
    <ThemeCard variant="3d" className={`p-5 relative min-w-0 ${className}`}>
      {/* Subtle ambient tier background bloom clipped inside its own decorative layer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ borderRadius: 'inherit' }}
      >
        <div
          className="absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl opacity-15"
          style={{ backgroundColor: scoreData.tierColor }}
        />
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 mb-4 relative z-10 min-w-0">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-0.5"
            style={{
              backgroundColor: `color-mix(in oklab, ${scoreData.tierColor} 18%, transparent)`,
              color: scoreData.tierColor,
              boxShadow: `0 0 12px color-mix(in oklab, ${scoreData.tierColor} 25%, transparent)`,
            }}
          >
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base text-[var(--ff-text-primary)] leading-snug break-words">
              Daily Productivity Score
            </h3>
            <span className="text-xs text-[var(--ff-text-muted)] block whitespace-normal break-words leading-snug mt-0.5">
              Deterministic 0–100 execution index
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFormula((prev) => !prev)}
          className="flex items-center gap-1 text-xs font-medium text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] transition-colors p-1 rounded-md shrink-0"
          title="Inspect calculation formula"
          aria-expanded={showFormula}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Formula</span>
          {showFormula ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Main Score & Tier Cluster */}
      <div className="flex flex-col 2xl:flex-row items-center 2xl:items-start gap-5 py-1 relative z-10 min-w-0">
        {/* Circular Progress Gauge */}
        <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
          {/* Subtle soft gauge bloom */}
          <div
            aria-hidden="true"
            className="absolute inset-2 rounded-full blur-xl pointer-events-none opacity-20"
            style={{ backgroundColor: scoreData.tierColor }}
          />

          <svg className="w-full h-full -rotate-90 transform drop-shadow-sm" viewBox="0 0 100 100">
            {/* Concentric Inner Depth Ring */}
            <circle
              cx="50"
              cy="50"
              r={radius - strokeWidth * 0.7}
              stroke="var(--ff-border-color)"
              strokeWidth={1}
              strokeDasharray="2 3"
              fill="transparent"
              className="opacity-40"
            />
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
              style={{
                filter: `drop-shadow(0 0 4px color-mix(in oklab, ${scoreData.tierColor} 60%, transparent))`,
              }}
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
        <div className="flex-1 w-full min-w-0 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 min-w-0">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 max-w-full whitespace-normal leading-tight"
              style={{
                backgroundColor: `color-mix(in oklab, ${scoreData.tierColor} 16%, transparent)`,
                color: scoreData.tierColor,
              }}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{scoreData.tier}</span>
            </span>
            <span className="text-xs text-[var(--ff-text-muted)] whitespace-normal leading-snug">
              Updated in real-time
            </span>
          </div>

          {/* Four Weighted Pillar Progress Bars */}
          <div className="space-y-2.5 text-xs">
            {/* 1. Task Completion (35%) */}
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2 text-[var(--ff-text-secondary)] mb-1 min-w-0">
                <span className="flex items-start gap-1.5 min-w-0 flex-1 whitespace-normal break-words leading-snug">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Task Completion (35 pts max)</span>
                </span>
                <span className="font-mono font-semibold shrink-0 whitespace-nowrap tabular-nums">
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
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2 text-[var(--ff-text-secondary)] mb-1 min-w-0">
                <span className="flex items-start gap-1.5 min-w-0 flex-1 whitespace-normal break-words leading-snug">
                  <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                  <span>Focus Time Goal (35 pts max)</span>
                </span>
                <span className="font-mono font-semibold shrink-0 whitespace-nowrap tabular-nums">
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
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2 text-[var(--ff-text-secondary)] mb-1 min-w-0">
                <span className="flex items-start gap-1.5 min-w-0 flex-1 whitespace-normal break-words leading-snug">
                  <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>Habit Consistency (20 pts max)</span>
                </span>
                <span className="font-mono font-semibold shrink-0 whitespace-nowrap tabular-nums">
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
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2 text-[var(--ff-text-secondary)] mb-1 min-w-0">
                <span className="flex items-start gap-1.5 min-w-0 flex-1 whitespace-normal break-words leading-snug">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                  <span>Daily Targets Bonus (10 pts max)</span>
                </span>
                <span className="font-mono font-semibold shrink-0 whitespace-nowrap tabular-nums">
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
