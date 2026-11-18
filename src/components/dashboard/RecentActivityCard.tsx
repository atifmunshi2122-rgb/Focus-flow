import React from 'react';
import {
  Activity,
  CheckCircle2,
  Flame,
  IndianRupee,
  Settings,
  Timer,
} from 'lucide-react';
import { ActivityFeedItem } from '../../lib/dashboardIntelligence.ts';
import { ThemeBadge, ThemeCard } from '../ui/ThemePrimitives.tsx';

interface RecentActivityCardProps {
  items: ActivityFeedItem[];
  weeklyFocusMinutes: number;
  weeklyGoalMinutes: number;
  completedPomodorosCount: number;
}

const formatRelativeTime = (iso: string): string => {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const iconForKind = (kind: ActivityFeedItem['kind']) => {
  switch (kind) {
    case 'focus':
      return <Timer className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />;
    case 'task':
      return <CheckCircle2 className="w-3.5 h-3.5 text-[var(--ff-success)]" />;
    case 'finance':
      return <IndianRupee className="w-3.5 h-3.5 text-[var(--ff-warning)]" />;
    case 'habit':
      return <Flame className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />;
    default:
      return <Settings className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />;
  }
};

export const RecentActivityCard: React.FC<RecentActivityCardProps> = ({
  items,
  weeklyFocusMinutes,
  weeklyGoalMinutes,
  completedPomodorosCount,
}) => {
  const weeklyPct =
    weeklyGoalMinutes > 0
      ? Math.min(100, Math.round((weeklyFocusMinutes / weeklyGoalMinutes) * 100))
      : 0;

  return (
    <ThemeCard className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--ff-border-color)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              background: 'var(--ff-surface-subtle)',
              borderColor: 'var(--ff-border-color)',
              color: 'var(--ff-accent-text)',
            }}
          >
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)] leading-snug">
              Recent Activity
            </h3>
            <p className="text-[11px] text-[var(--ff-text-muted)] whitespace-normal break-words leading-snug mt-0.5">
              Latest completed sessions, tasks &amp; ledger events
            </p>
          </div>
        </div>
        <ThemeBadge tone="neutral">{weeklyPct}% wk goal</ThemeBadge>
      </div>

      {/* Compact Weekly Snapshot Strip */}
      <div className="grid grid-cols-2 gap-2">
        <div className="ff-surface-subtle px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
            Weekly Focus
          </span>
          <p className="text-sm font-black font-mono text-[var(--ff-text-primary)] mt-0.5">
            {weeklyFocusMinutes >= 60
              ? `${Math.floor(weeklyFocusMinutes / 60)}h ${weeklyFocusMinutes % 60}m`
              : `${weeklyFocusMinutes}m`}
          </p>
        </div>
        <div className="ff-surface-subtle px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
            Pomodoros Done
          </span>
          <p className="text-sm font-black font-mono text-[var(--ff-accent-text)] mt-0.5">
            {completedPomodorosCount}
          </p>
        </div>
      </div>

      {/* Activity Feed */}
      {items.length === 0 ? (
        <div className="ff-surface-subtle px-3 py-3 text-xs text-[var(--ff-text-muted)]">
          Complete a focus session, check off a task, or log an entry to build your activity timeline.
        </div>
      ) : (
        <div className="space-y-1.5 flex-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="ff-surface-subtle px-2.5 py-2 flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-6 h-6 rounded-md bg-[var(--ff-surface)] border border-[var(--ff-border-color)] flex items-center justify-center shrink-0">
                  {iconForKind(item.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    title={item.title}
                    className="text-xs font-semibold text-[var(--ff-text-primary)] whitespace-normal break-words leading-snug line-clamp-2"
                  >
                    {item.title}
                  </p>
                  <p
                    title={item.subtitle}
                    className="text-[10px] text-[var(--ff-text-muted)] whitespace-normal break-words leading-snug line-clamp-1 mt-0.5"
                  >
                    {item.subtitle}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--ff-text-muted)] shrink-0">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </ThemeCard>
  );
};

