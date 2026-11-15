import React from 'react';

interface TabLoadingFallbackProps {
  label?: string;
}

export const TabLoadingFallback: React.FC<TabLoadingFallbackProps> = ({ label = 'Loading view...' }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="flex flex-col w-full animate-in fade-in duration-150"
      style={{ gap: 'var(--ff-section-gap, 1.75rem)' }}
    >
      <span className="sr-only">{label}</span>

      {/* View Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl ff-skeleton shrink-0"
            style={{ borderRadius: 'var(--ff-radius-button, 10px)' }}
          />
          <div className="space-y-2">
            <div className="h-5 w-44 rounded-md ff-skeleton" />
            <div className="h-3 w-64 max-w-full rounded-md ff-skeleton opacity-70" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 rounded-lg ff-skeleton" />
          <div className="h-8 w-28 rounded-lg ff-skeleton" />
        </div>
      </div>

      {/* Hero / Main Card Skeleton */}
      <div
        className="ff-card p-6 sm:p-8 space-y-4"
        style={{ borderRadius: 'var(--ff-radius-card, 16px)' }}
      >
        <div className="h-4 w-32 rounded-md ff-skeleton" />
        <div className="h-8 w-80 max-w-full rounded-md ff-skeleton" />
        <div className="h-3.5 w-96 max-w-full rounded-md ff-skeleton opacity-70" />
        <div className="pt-2 flex flex-wrap gap-3">
          <div className="h-9 w-32 rounded-lg ff-skeleton" />
          <div className="h-9 w-36 rounded-lg ff-skeleton opacity-80" />
        </div>
      </div>

      {/* Metric Cards Skeleton Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        style={{ gap: 'var(--ff-grid-gap, 1rem)' }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="ff-card p-4 space-y-3"
            style={{ borderRadius: 'var(--ff-radius-card, 16px)' }}
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded ff-skeleton opacity-80" />
              <div className="w-6 h-6 rounded-md ff-skeleton opacity-60" />
            </div>
            <div className="h-7 w-28 rounded ff-skeleton font-mono" />
            <div className="h-2.5 w-32 rounded ff-skeleton opacity-60" />
          </div>
        ))}
      </div>

      {/* Content Area Skeleton */}
      <div
        className="ff-card p-6 space-y-4 min-h-[220px]"
        style={{ borderRadius: 'var(--ff-radius-card, 16px)' }}
      >
        <div className="flex justify-between items-center pb-2 border-b ff-divider">
          <div className="h-4 w-40 rounded ff-skeleton" />
          <div className="h-7 w-24 rounded ff-skeleton" />
        </div>
        <div className="space-y-3 pt-2">
          <div className="h-10 w-full rounded-lg ff-skeleton opacity-90" />
          <div className="h-10 w-full rounded-lg ff-skeleton opacity-80" />
          <div className="h-10 w-full rounded-lg ff-skeleton opacity-70" />
        </div>
      </div>
    </div>
  );
};

