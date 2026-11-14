import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThemeConfig } from '../../types/theme.ts';
import { buildThemeCssVariables } from '../../theme/themeEngine.ts';
import { getStyleDefinition } from '../../theme/stylesRegistry.ts';
import {
  Eye,
  EyeOff,
  Check,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Clock,
  Wallet,
  CheckCircle2,
  X,
  Layers,
} from 'lucide-react';
import { ThemeBadge, ThemeButton } from '../ui/ThemePrimitives.tsx';

interface LiveThemePreviewPanelProps {
  draftConfig: ThemeConfig;
  resolvedMode: 'light' | 'dark';
  isFullAppPreview: boolean;
  startFullAppPreview: (config: ThemeConfig) => void;
  stopFullAppPreview: () => void;
  onApplyDraft: () => Promise<void> | void;
  onDiscardDraft: () => void;
  hasUnappliedChanges: boolean;
}

export const LiveThemePreviewPanel: React.FC<LiveThemePreviewPanelProps> = ({
  draftConfig,
  resolvedMode,
  isFullAppPreview,
  startFullAppPreview,
  stopFullAppPreview,
  onApplyDraft,
  onDiscardDraft,
  hasUnappliedChanges,
}) => {
  const [activeNavTab, setActiveNavTab] = useState<'overview' | 'focus' | 'finance'>('overview');
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [sampleInputValue, setSampleInputValue] = useState('Deep Work Sprint');

  const styleDef = getStyleDefinition(draftConfig.styleId);
  const draftVars = useMemo(
    () => buildThemeCssVariables(draftConfig, resolvedMode),
    [draftConfig, resolvedMode]
  );

  const threeD = draftConfig.threeDLighting || {};
  const ambientIntensity = (threeD.ambientLightIntensity ?? 40) / 100;
  const ambientColor = threeD.ambientLightColor || 'var(--ff-accent)';

  return (
    <div className="space-y-3">
      {/* Sandbox Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}
            >
              <Eye className="w-4 h-4" />
            </span>
            <span className="text-sm font-bold text-[var(--ff-text-primary)]">
              Interactive 3D Theme Sandbox
            </span>
          </div>

          <ThemeBadge tone={hasUnappliedChanges ? 'warning' : 'success'}>
            {hasUnappliedChanges ? 'Draft Staged' : 'Synchronized'}
          </ThemeBadge>
          <span className="text-xs text-[var(--ff-text-muted)] hidden sm:inline">
            {styleDef.name} · {resolvedMode.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Full-App Preview */}
          <ThemeButton
            variant={isFullAppPreview ? 'primary' : 'secondary'}
            size="xs"
            onClick={() => (isFullAppPreview ? stopFullAppPreview() : startFullAppPreview(draftConfig))}
            title="Preview changes across all real app pages"
          >
            {isFullAppPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{isFullAppPreview ? 'Exit App Preview' : 'Preview Whole App'}</span>
          </ThemeButton>

          {/* Discard Draft Button */}
          {hasUnappliedChanges && (
            <ThemeButton variant="secondary" size="xs" onClick={onDiscardDraft}>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard</span>
            </ThemeButton>
          )}

          {/* Apply Globally Button */}
          <ThemeButton
            variant="primary"
            size="xs"
            onClick={() => void onApplyDraft()}
            disabled={!hasUnappliedChanges}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Globally</span>
          </ThemeButton>
        </div>
      </div>

      {/* Scoped CSS Sandbox Container */}
      <div
        data-design-style={draftConfig.styleId}
        data-theme-mode={resolvedMode}
        data-density={draftConfig.density}
        data-animation={draftConfig.animationIntensity}
        style={{
          ...(draftVars as React.CSSProperties),
          backgroundColor: 'var(--ff-bg-canvas)',
          backgroundImage: 'var(--ff-bg-backdrop)',
          color: 'var(--ff-text-primary)',
          fontFamily: 'var(--ff-font-sans)',
          borderRadius: 'var(--ff-radius-card)',
          border: 'var(--ff-border-width) solid var(--ff-border-color)',
          boxShadow: `0 0 60px -15px ${ambientColor}`,
        }}
        className="relative overflow-hidden p-5 sm:p-6 transition-all duration-300 ease-out select-none"
      >
        {/* Subtle Ambient Light Orb behind cards */}
        <div
          className="absolute -top-12 -right-12 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-opacity duration-300"
          style={{
            background: ambientColor,
            opacity: ambientIntensity * 0.45,
          }}
        />

        {/* Mini App Header & Navigation Simulator */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 pb-4 border-b border-[var(--ff-border-color)]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-md"
              style={{
                background: 'var(--ff-accent)',
                color: 'var(--ff-accent-contrast)',
              }}
            >
              FF
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--ff-font-display)' }}>
                FocusFlow &amp; Finance
              </div>
              <div className="text-[11px] opacity-75">
                {styleDef.name} Architecture · Live Sandbox
              </div>
            </div>
          </div>

          {/* Mini Nav Pills */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)]">
            {(['overview', 'focus', 'finance'] as const).map((tab) => {
              const isActive = activeNavTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveNavTab(tab)}
                  className="relative px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors"
                  style={{
                    color: isActive ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="preview-mini-nav-pill"
                      className="absolute inset-0 rounded-lg shadow-sm"
                      style={{ background: 'var(--ff-accent)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{tab}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dashboard Grid Simulation */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {/* Card 1: Finance Metric */}
          <div className="ff-card ff-card-interactive p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[var(--ff-text-muted)] flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                <span>Monthly Net Flow</span>
              </span>
              <span className="ff-badge px-2 py-0.5 text-[10px] font-bold flex items-center gap-0.5" style={{ background: 'var(--ff-success-soft)', color: 'var(--ff-success)' }}>
                <TrendingUp className="w-3 h-3" />
                <span>+18.4%</span>
              </span>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--ff-font-display)' }}>
                $14,850.00
              </div>
              <div className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                Income $18.2k · Expenses $3.35k
              </div>
            </div>
          </div>

          {/* Card 2: Focus Metric */}
          <div className="ff-card ff-card-interactive p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[var(--ff-text-muted)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                <span>Daily Focus Target</span>
              </span>
              <span className="ff-badge px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}>
                4h 25m / 5h
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Progress Rate</span>
                <span>88%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--ff-surface-muted)]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: '88%',
                    background: 'linear-gradient(90deg, var(--ff-accent), var(--ff-secondary))',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Interactive SVG Trend Curve */}
          <div className="ff-card ff-card-interactive p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--ff-text-muted)]">
                Velocity Chart
              </span>
              <span className="text-[10px] text-[var(--ff-text-muted)]">Last 7 Days</span>
            </div>
            <div className="h-14 w-full flex items-end">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ff-accent)" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="var(--ff-accent)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,32 Q25,8 50,22 T100,6 L100,40 L0,40 Z"
                  fill="url(#chartGradient)"
                />
                <path
                  d="M0,32 Q25,8 50,22 T100,6"
                  fill="none"
                  stroke="var(--ff-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Buttons & Form Controls Strip */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
          {/* Interactive Form Input */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              aria-label="Sample interactive input"
              value={sampleInputValue}
              onChange={(e) => setSampleInputValue(e.target.value)}
              className="ff-input w-full px-3 py-2 text-xs"
              placeholder="Interactive input focus ring..."
            />
          </div>

          {/* Action Buttons Showcase */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ff-btn ff-btn-primary px-3 py-2 text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Primary CTA</span>
            </button>
            <button type="button" className="ff-btn ff-btn-secondary px-3 py-2 text-xs">
              <span>Secondary</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSampleModal(true)}
              className="ff-btn ff-btn-secondary px-3 py-2 text-xs border border-dashed"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Test Modal</span>
            </button>
          </div>
        </div>

        {/* Sample Modal Simulation */}
        <AnimatePresence>
          {showSampleModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.92, y: 12, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.92, y: 12, opacity: 0 }}
                className="w-full max-w-sm rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-elevated)] p-5 shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[var(--ff-success)]" />
                    <h5 className="text-sm font-bold text-[var(--ff-text-primary)]">
                      Modal Depth Simulation
                    </h5>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSampleModal(false)}
                    className="text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-[var(--ff-text-muted)]">
                  Verify backdrop optical blur, modal elevation, surface contrast, and button hierarchy in this theme.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSampleModal(false)}
                    className="ff-btn ff-btn-secondary px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSampleModal(false)}
                    className="ff-btn ff-btn-primary px-3 py-1.5 text-xs"
                  >
                    Confirm Action
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
