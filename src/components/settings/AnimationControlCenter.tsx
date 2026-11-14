import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AnimationIntensity, ThemeConfig } from '../../types/theme.ts';
import {
  getIntensityFactor,
  getSpringTransition,
  MOTION_DURATION,
} from '../../theme/motionTokens.ts';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { ThemeBadge, ThemeButton, ThemeCard, ThemeProgressBar, ThemeSegmentedControl } from '../ui/ThemePrimitives.tsx';
import { Zap, ShieldCheck, Play, Sparkles, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';

interface AnimationControlCenterProps {
  draftConfig: ThemeConfig;
  updateDraft: (patch: Partial<ThemeConfig>) => void;
  showToast?: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

export const AnimationControlCenter: React.FC<AnimationControlCenterProps> = ({
  draftConfig,
  updateDraft,
  showToast,
}) => {
  const { isDisabled } = useMotionPreferences();
  const [testTrigger, setTestTrigger] = useState(0);

  const osReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const intensity = draftConfig.animationIntensity;
  const isCompletelyDisabled = intensity === 'none' || isDisabled;
  const factor = getIntensityFactor(intensity);
  const spring = getSpringTransition(intensity, isCompletelyDisabled);

  const handleToggleReducedMotion = () => {
    const nextIntensity: AnimationIntensity = intensity === 'none' ? 'standard' : 'none';
    updateDraft({ animationIntensity: nextIntensity });
    if (showToast) {
      showToast(
        nextIntensity === 'none'
          ? 'Reduced motion enabled: all transitions set to instant'
          : 'Standard animation restored',
        nextIntensity === 'none' ? 'info' : 'success'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Motion Safety Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
              Animation Control Center &amp; Motion Physics
            </h3>
            <ThemeBadge tone="accent">Framer Engine</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-2xl">
            Fine-tune spring kinetics, micro-interaction feedback, modal entrances, and accessibility settings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {osReducedMotion && (
            <ThemeBadge tone="warning">OS Reduced Motion Active</ThemeBadge>
          )}
          {intensity === 'none' && (
            <ThemeBadge tone="neutral">Zero-Motion Mode</ThemeBadge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Animation Intensity Selector & Mode Card */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Global Motion Intensity
              </h4>
            </div>
            <ThemeBadge tone={intensity === 'none' ? 'neutral' : 'accent'}>
              {intensity.toUpperCase()} ({Math.round(factor * 100)}%)
            </ThemeBadge>
          </div>

          <p className="text-xs text-[var(--ff-text-muted)]">
            Controls spring stiffness, damping, stagger delays, and card hover lifts across every module.
          </p>

          <ThemeSegmentedControl<AnimationIntensity>
            fullWidth
            ariaLabel="Animation intensity selector"
            value={draftConfig.animationIntensity}
            onChange={(animationIntensity) => updateDraft({ animationIntensity })}
            options={[
              { id: 'none', label: 'None (Instant)' },
              { id: 'subtle', label: 'Subtle' },
              { id: 'standard', label: 'Standard' },
              { id: 'expressive', label: 'Expressive' },
            ]}
          />

          {/* Reduced Motion Toggle Box */}
          <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--ff-success)]" />
                <span>Zero-Animation / Reduced-Motion Mode</span>
              </div>
              <p className="text-[11px] text-[var(--ff-text-muted)]">
                Instantly eliminate all motion, sliding transitions, and backdrop shimmers for vestibular comfort and battery saving.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleReducedMotion}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                intensity === 'none'
                  ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] border-transparent'
                  : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-primary)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent-border)]'
              }`}
            >
              {intensity === 'none' ? 'Enabled' : 'Disable Motion'}
            </button>
          </div>

          {/* Description of current level */}
          <div className="text-xs text-[var(--ff-text-secondary)] space-y-1">
            <div className="font-semibold text-[var(--ff-text-primary)]">Current Physics Profile:</div>
            {intensity === 'none' && (
              <p>Duration: 0ms · All transitions occur instantly without interpolation.</p>
            )}
            {intensity === 'subtle' && (
              <p>Stiffness: 440 · Damping: 32 · Gentle, understated micro-lifts ideal for calm focus.</p>
            )}
            {intensity === 'standard' && (
              <p>Stiffness: 380 · Damping: 26 · Balanced spring kinetics mirroring native macOS and iOS.</p>
            )}
            {intensity === 'expressive' && (
              <p>Stiffness: 340 · Damping: 20 · Bouncy, high-energy tactile springs with noticeable overshoot.</p>
            )}
          </div>
        </ThemeCard>

        {/* Live Motion Sandbox & Verification Preview */}
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Interactive Motion Sandbox
              </h4>
            </div>
            <ThemeButton
              variant="secondary"
              size="xs"
              onClick={() => setTestTrigger((n) => n + 1)}
            >
              <RefreshCw className="w-3 h-3" />
              <span>Replay Entrance</span>
            </ThemeButton>
          </div>

          <p className="text-xs text-[var(--ff-text-muted)]">
            Interact with the elements below to preview tap compressions, hover elevations, and entrance physics under the selected intensity.
          </p>

          <div className="space-y-3 pt-1">
            {/* Interactive Spring Test Card */}
            <motion.div
              key={`box-${testTrigger}`}
              initial={isCompletelyDisabled ? { opacity: 1 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              whileHover={isCompletelyDisabled ? undefined : { y: -3, scale: 1.01 }}
              whileTap={isCompletelyDisabled ? undefined : { scale: 0.98 }}
              className="p-4 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] cursor-pointer select-none transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}
                  >
                    <Layers className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="text-xs font-bold text-[var(--ff-text-primary)]">
                      Spring Reactive Card
                    </div>
                    <div className="text-[11px] text-[var(--ff-text-muted)]">
                      Hover to lift · Click to compress
                    </div>
                  </div>
                </div>
                <ThemeBadge tone="success">
                  {isCompletelyDisabled ? 'Zero Motion' : `${Math.round(factor * 100)}% Spring`}
                </ThemeBadge>
              </div>
            </motion.div>

            {/* Test Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <motion.button
                type="button"
                whileHover={isCompletelyDisabled ? undefined : { scale: 1.02 }}
                whileTap={isCompletelyDisabled ? undefined : { scale: 0.96 }}
                transition={spring}
                className="ff-btn ff-btn-primary py-2 px-3 text-xs justify-center"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Primary Spring Button</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={isCompletelyDisabled ? undefined : { scale: 1.02 }}
                whileTap={isCompletelyDisabled ? undefined : { scale: 0.96 }}
                transition={spring}
                className="ff-btn ff-btn-secondary py-2 px-3 text-xs justify-center"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Secondary Feedback</span>
              </motion.button>
            </div>

            {/* Animated Progress Meter */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ff-text-muted)]">Kinetics Test Meter</span>
                <span className="font-mono font-bold text-[var(--ff-text-primary)]">85%</span>
              </div>
              <ThemeProgressBar value={85} tone="accent" label="Motion test meter" heightClass="h-2" />
            </div>
          </div>
        </ThemeCard>
      </div>

      {/* Physics Timing Token Matrix */}
      <ThemeCard className="space-y-3">
        <h4 className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider">
          Engineered Timing Tokens Matrix
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-center">
            <div className="font-mono font-bold text-[var(--ff-accent-text)]">
              {isCompletelyDisabled ? '0ms' : `${Math.round(MOTION_DURATION.micro * factor * 1000)}ms`}
            </div>
            <div className="text-[10px] text-[var(--ff-text-muted)] mt-0.5">Micro Control</div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-center">
            <div className="font-mono font-bold text-[var(--ff-accent-text)]">
              {isCompletelyDisabled ? '0ms' : `${Math.round(MOTION_DURATION.control * factor * 1000)}ms`}
            </div>
            <div className="text-[10px] text-[var(--ff-text-muted)] mt-0.5">Button Press</div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-center">
            <div className="font-mono font-bold text-[var(--ff-accent-text)]">
              {isCompletelyDisabled ? '0ms' : `${Math.round(MOTION_DURATION.dropdown * factor * 1000)}ms`}
            </div>
            <div className="text-[10px] text-[var(--ff-text-muted)] mt-0.5">Menu Drawer</div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-center">
            <div className="font-mono font-bold text-[var(--ff-accent-text)]">
              {isCompletelyDisabled ? '0ms' : `${Math.round(MOTION_DURATION.card * factor * 1000)}ms`}
            </div>
            <div className="text-[10px] text-[var(--ff-text-muted)] mt-0.5">Card Entrance</div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-center">
            <div className="font-mono font-bold text-[var(--ff-accent-text)]">
              {isCompletelyDisabled ? '0ms' : `${Math.round(MOTION_DURATION.page * factor * 1000)}ms`}
            </div>
            <div className="text-[10px] text-[var(--ff-text-muted)] mt-0.5">Page Shift</div>
          </div>
          <div className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-center">
            <div className="font-mono font-bold text-[var(--ff-accent-text)]">
              {isCompletelyDisabled ? '0ms' : `${Math.round(MOTION_DURATION.celebration * factor * 1000)}ms`}
            </div>
            <div className="text-[10px] text-[var(--ff-text-muted)] mt-0.5">Celebration</div>
          </div>
        </div>
      </ThemeCard>
    </div>
  );
};
