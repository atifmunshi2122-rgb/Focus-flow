import React, { useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  Layers,
  Database,
  TrendingUp,
  BarChart3,
  PieChart,
  ListTodo,
  AlertCircle,
  Lock,
} from 'lucide-react';
import type { SheetSyncedRow, SheetTabSchema } from '../../types/sheetHub.ts';
import { ThemeCard, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { AnimatedProgressBar, AnimatedNumber } from '../ui/MotionPrimitives.tsx';

interface DynamicOverviewPanelProps {
  tabs: SheetTabSchema[];
  rowsByTabId: Record<string, SheetSyncedRow[]>;
  onSelectTab: (tabId: string) => void;
}

export const DynamicOverviewPanel: React.FC<DynamicOverviewPanelProps> = ({
  tabs,
  rowsByTabId,
  onSelectTab,
}) => {
  const dataTabs = useMemo(() => tabs.filter((t) => t.role === 'data'), [tabs]);

  // Aggregate stats across all data tabs
  const aggregates = useMemo(() => {
    let grandTotal = 0;
    let grandCompleted = 0;
    let hasDoneColumn = false;

    const tabStats = dataTabs.map((tab) => {
      const rows = rowsByTabId[tab.id] || [];
      const doneCol = tab.columns.find((c) => c.semanticRole === 'done' || c.inferredType === 'checkbox' || c.inferredType === 'boolean');
      const groupCol = tab.columns.find((c) => c.semanticRole === 'group');

      let completed = 0;
      let total = rows.length;

      if (doneCol) {
        hasDoneColumn = true;
        completed = rows.filter((r) => r.values[doneCol.fieldKey] === true).length;
      }

      // Group-level progress (e.g. Modules)
      const groupsMap = new Map<string, { total: number; completed: number }>();
      if (groupCol) {
        for (const row of rows) {
          const groupName = String(row.values[groupCol.fieldKey] || 'General').trim() || 'General';
          const entry = groupsMap.get(groupName) || { total: 0, completed: 0 };
          entry.total++;
          if (doneCol && row.values[doneCol.fieldKey] === true) entry.completed++;
          groupsMap.set(groupName, entry);
        }
      }

      const groups = Array.from(groupsMap.entries()).map(([name, data]) => ({
        name,
        total: data.total,
        completed: data.completed,
        percent: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      }));

      grandTotal += total;
      grandCompleted += completed;

      return {
        tabId: tab.id,
        title: tab.sheetTitle,
        total,
        completed,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
        hasDone: Boolean(doneCol),
        groups,
      };
    });

    const grandPercent = grandTotal > 0 ? Math.round((grandCompleted / grandTotal) * 100) : 0;

    return {
      grandTotal,
      grandCompleted,
      grandPending: Math.max(0, grandTotal - grandCompleted),
      grandPercent,
      hasDoneColumn,
      tabStats,
    };
  }, [dataTabs, rowsByTabId]);

  return (
    <div className="space-y-6">
      {/* Top Snapshot Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Total Records</span>
            <Database className="w-4 h-4 text-[var(--ff-accent)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--ff-text-primary)]">
            <AnimatedNumber value={aggregates.grandTotal} />
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Across {dataTabs.length} active data tab(s)</p>
        </ThemeCard>

        {aggregates.hasDoneColumn && (
          <>
            <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
              <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                <span className="uppercase font-semibold tracking-wider text-[10px]">Completed</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-500">
                <AnimatedNumber value={aggregates.grandCompleted} />
              </div>
              <p className="text-xs text-[var(--ff-text-muted)] mt-1">{aggregates.grandPercent}% overall completion</p>
            </ThemeCard>

            <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
              <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                <span className="uppercase font-semibold tracking-wider text-[10px]">Remaining</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-amber-500">
                <AnimatedNumber value={aggregates.grandPending} />
              </div>
              <p className="text-xs text-[var(--ff-text-muted)] mt-1">Pending items to complete</p>
            </ThemeCard>

            <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
              <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                <span className="uppercase font-semibold tracking-wider text-[10px]">Progress</span>
                <TrendingUp className="w-4 h-4 text-[var(--ff-accent)]" />
              </div>
              <div className="text-2xl font-bold text-[var(--ff-accent)]">
                {aggregates.grandPercent}%
              </div>
              <div className="mt-2">
                <AnimatedProgressBar value={aggregates.grandPercent} max={100} heightClass="h-1.5" />
              </div>
            </ThemeCard>
          </>
        )}
      </div>

      {/* Tab-wise breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base text-[var(--ff-text-primary)] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--ff-accent)]" />
            <span>Tab-Wise Progress & Breakdown</span>
          </h3>
          <span className="text-xs text-[var(--ff-text-muted)]">Calculated from imported rows</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {aggregates.tabStats.map((tab) => (
            <ThemeCard
              key={tab.tabId}
              variant="elevated"
              className="p-5 border border-[var(--ff-border-color)] hover:border-[var(--ff-accent)] transition-all cursor-pointer group"
              onClick={() => onSelectTab(tab.tabId)}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h4 className="font-semibold text-base text-[var(--ff-text-primary)] group-hover:text-[var(--ff-accent)] transition-colors">
                    {tab.title}
                  </h4>
                  <span className="text-xs text-[var(--ff-text-muted)]">
                    {tab.total.toLocaleString()} total items
                  </span>
                </div>
                {tab.hasDone ? (
                  <ThemeBadge tone={tab.percent >= 100 ? 'success' : tab.percent > 0 ? 'warning' : 'neutral'}>
                    {tab.completed} / {tab.total} ({tab.percent}%)
                  </ThemeBadge>
                ) : (
                  <ThemeBadge tone="neutral">{tab.total} rows</ThemeBadge>
                )}
              </div>

              {tab.hasDone && (
                <div className="mb-4">
                  <AnimatedProgressBar value={tab.percent} max={100} heightClass="h-1.5" />
                </div>
              )}

              {/* Group previews (e.g. Modules) */}
              {tab.groups.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--ff-border-color)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] block">
                    Group Completion
                  </span>
                  <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {tab.groups.slice(0, 5).map((g) => (
                      <div key={g.name} className="flex items-center justify-between text-xs py-0.5">
                        <span className="truncate text-[var(--ff-text-secondary)] max-w-[180px]" title={g.name}>
                          {g.name}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--ff-text-muted)] shrink-0">
                          {g.completed}/{g.total} ({g.percent}%)
                        </span>
                      </div>
                    ))}
                    {tab.groups.length > 5 && (
                      <span className="text-[11px] text-[var(--ff-accent)] font-medium">
                        +{tab.groups.length - 5} more groups...
                      </span>
                    )}
                  </div>
                </div>
              )}
            </ThemeCard>
          ))}
        </div>
      </div>
    </div>
  );
};
