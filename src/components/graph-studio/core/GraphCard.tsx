import React from 'react';
import {
  Download,
  Maximize2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import { ThemeCard, ThemeBadge, ThemeButton } from '../../ui/ThemePrimitives.tsx';
import { EmptyStateIllustration } from '../../ui/MotionPrimitives.tsx';

export interface GraphLegendItem {
  label: string;
  color: string;
  isDashed?: boolean;
}

export interface GraphCardProps {
  id: string;
  title: string;
  subtitle?: string;
  domain: 'study' | 'finance' | 'productivity' | 'habits' | 'custom';
  icon?: React.ReactNode;
  legend?: GraphLegendItem[];
  badge?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onExpand?: () => void;
  onExportCsv?: () => void;
  onExportPng?: () => void;
  isNotConnected?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const GraphCard: React.FC<GraphCardProps> = ({
  id,
  title,
  subtitle,
  domain,
  icon,
  legend = [],
  badge,
  loading = false,
  error = null,
  onRetry,
  isEmpty = false,
  emptyTitle = 'No data in selected timeframe',
  emptyDescription = 'Record new activity or expand the timeframe to visualize metrics.',
  onExpand,
  onExportCsv,
  onExportPng,
  isNotConnected = false,
  className = '',
  children,
}) => {
  return (
    <ThemeCard
      className={`flex flex-col justify-between overflow-hidden relative group transition-all duration-200 ${className}`}
      id={`graph-${id}`}
    >
      {/* Top Header Row (Row 1: Title + Actions, Row 2: Legend pills) */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {icon && (
                <span className="text-[var(--ff-accent-text)] shrink-0">
                  {icon}
                </span>
              )}
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)] whitespace-normal">
                {title}
              </h3>

              {badge ? (
                badge
              ) : isNotConnected ? (
                <ThemeBadge tone="neutral">
                  Not Yet Connected
                </ThemeBadge>
              ) : null}
            </div>

            {subtitle && (
              <p className="text-xs text-[var(--ff-text-muted)]">
                {subtitle}
              </p>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] transition-all"
              title="Export CSV dataset"
              aria-label={`Export CSV for ${title}`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {onExportPng && (
            <button
              type="button"
              onClick={onExportPng}
              className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] transition-all text-[11px] font-semibold"
              title="Export high-resolution PNG image"
              aria-label={`Export PNG for ${title}`}
            >
              PNG
            </button>
          )}

          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] transition-all"
              title="Expand graph details"
              aria-label={`Expand details for ${title}`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          </div>
        </div>

        {legend.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[var(--ff-text-muted)]">
            {legend.map((l, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{
                    backgroundColor: l.color,
                    border: l.isDashed ? '1px dashed currentColor' : undefined,
                  }}
                />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Viewport */}
      <div className="relative min-h-[220px] flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="w-full h-56 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--ff-accent)] border-t-transparent animate-spin" />
            <span className="text-xs font-mono text-[var(--ff-text-muted)] animate-pulse">
              Aggregating verified metrics...
            </span>
          </div>
        ) : error ? (
          <div className="p-6 text-center rounded-xl border border-red-500/20 bg-red-500/5 space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-rose-400" />
            <p className="text-xs font-semibold text-[var(--ff-text-primary)]">Data Retrieval Failed</p>
            <p className="text-[11px] text-[var(--ff-text-muted)] max-w-sm mx-auto">{error}</p>
            {onRetry && (
              <ThemeButton variant="secondary" size="xs" onClick={onRetry} className="mx-auto mt-2">
                <RotateCcw className="w-3 h-3 mr-1" /> Retry Query
              </ThemeButton>
            )}
          </div>
        ) : isNotConnected ? (
          <div className="p-6 text-center rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
            <Info className="w-6 h-6 mx-auto text-amber-400" />
            <p className="text-xs font-semibold text-[var(--ff-text-primary)]">Integration Pending</p>
            <p className="text-[11px] text-[var(--ff-text-muted)] max-w-sm mx-auto">
              This metric requires an institutional data integration or active sensor that is not yet configured.
            </p>
          </div>
        ) : isEmpty ? (
          <div className="py-8">
            <EmptyStateIllustration
              icon={<Sparkles className="w-6 h-6 text-[var(--ff-accent-text)]" />}
              title={emptyTitle}
              description={emptyDescription}
            />
          </div>
        ) : (
          children
        )}
      </div>
    </ThemeCard>
  );
};
