import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  Transition,
  animate,
  motion,
  useReducedMotion,
} from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import {
  MOTION_DURATION,
  MOTION_EASING,
  getPageTransition,
  getSpringTransition,
  getStaggerVariants,
  getThemeMotionProfile,
} from '../../theme/motionTokens.ts';
import { Check, AlertCircle } from 'lucide-react';

export function useMotionPreferences() {
  const { effectiveThemeConfig } = useApp();
  const osReduced = Boolean(useReducedMotion());
  const intensity = effectiveThemeConfig.animationIntensity;
  const isDisabled = osReduced || intensity === 'none';
  const styleId = effectiveThemeConfig.styleId;
  const profile = getThemeMotionProfile(styleId, intensity, isDisabled);

  return {
    intensity,
    osReduced,
    isDisabled,
    styleId,
    profile,
  };
}

interface MotionPageProps {
  routeKey: string;
  children: React.ReactNode;
}

export const MotionPage: React.FC<MotionPageProps> = ({ routeKey, children }) => {
  const { intensity, isDisabled, styleId } = useMotionPreferences();
  const variants = getPageTransition(intensity, isDisabled, styleId);

  return (
    <motion.div
      key={routeKey}
      variants={variants}
      initial={isDisabled ? false : 'initial'}
      animate="animate"
      exit={isDisabled ? undefined : 'exit'}
      className="w-full"
    >
      {children}
    </motion.div>
  );
};

interface MotionStaggerGridProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const MotionStaggerGrid: React.FC<MotionStaggerGridProps> = ({
  children,
  className = '',
  style,
}) => {
  const { intensity, isDisabled, styleId } = useMotionPreferences();
  const { container } = getStaggerVariants(intensity, isDisabled, styleId);

  return (
    <motion.div
      variants={container}
      initial={isDisabled ? false : 'hidden'}
      animate="show"
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
};

interface MotionStaggerItemProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const MotionStaggerItem: React.FC<MotionStaggerItemProps> = ({
  children,
  className = '',
  style,
}) => {
  const { intensity, isDisabled, styleId } = useMotionPreferences();
  const { item } = getStaggerVariants(intensity, isDisabled, styleId);

  return (
    <motion.div variants={item} className={className} style={style}>
      {children}
    </motion.div>
  );
};

interface AnimatedNumberProps {
  value: number;
  format?: (val: number) => string;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = (v) => String(Math.round(v)),
  className = '',
}) => {
  const { intensity, isDisabled } = useMotionPreferences();
  const prevValueRef = useRef<number>(value);
  const [displayValue, setDisplayValue] = useState<number>(value);

  useEffect(() => {
    const startVal = prevValueRef.current;
    prevValueRef.current = value;

    if (isDisabled || startVal === value) {
      setDisplayValue(value);
      return;
    }

    const duration =
      intensity === 'subtle' ? 0.25 : intensity === 'expressive' ? 0.55 : 0.4;

    const controls = animate(startVal, value, {
      duration,
      ease: MOTION_EASING.natural,
      onUpdate: (latest) => setDisplayValue(latest),
      onComplete: () => setDisplayValue(value),
    });

    return () => controls.stop();
  }, [value, isDisabled, intensity]);

  return <span className={className}>{format(displayValue)}</span>;
};

interface InteractiveSurface3DProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
}

/**
 * Selective 3D micro-interaction wrapper adding restrained perspective tilt
 * and dynamic light reflection on fine-pointer desktops.
 */
export const InteractiveSurface3D: React.FC<InteractiveSurface3DProps> = ({
  children,
  className = '',
  maxTilt = 2.2,
}) => {
  const { intensity, isDisabled, styleId } = useMotionPreferences();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });

  // Respect Flat, Brutalism, Minimalism, and Reduced/Subtle motion preferences
  const allow3D =
    !isDisabled &&
    intensity !== 'subtle' &&
    !['flat', 'brutalism', 'minimalism', 'editorial'].includes(styleId);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!allow3D || e.pointerType !== 'mouse' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const mult = intensity === 'expressive' ? 1.3 : 1;
    setTilt({
      rx: (0.5 - py) * maxTilt * 2 * mult,
      ry: (px - 0.5) * maxTilt * 2 * mult,
      gx: px * 100,
      gy: py * 100,
      active: true,
    });
  };

  const handlePointerLeave = () => {
    if (tilt.active) {
      setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative ${className}`.trim()}
      style={{ perspective: allow3D ? '1100px' : undefined }}
    >
      <div
        className="relative transition-transform duration-200 ease-out"
        style={{
          transform:
            allow3D && tilt.active
              ? `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`
              : 'rotateX(0deg) rotateY(0deg)',
          transformStyle: allow3D ? 'preserve-3d' : undefined,
        }}
      >
        {children}
        {allow3D && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-200"
            style={{
              opacity: tilt.active ? 0.14 : 0,
              borderRadius: 'calc(var(--ff-radius-card) * 1.15)',
              background: `radial-gradient(circle 320px at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.6), transparent 70%)`,
            }}
          />
        )}
      </div>
    </div>
  );
};

interface SkeletonBlockProps {
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({ className = '', style }) => (
  <div
    aria-hidden="true"
    className={`ff-skeleton rounded-md ${className}`.trim()}
    style={style}
  />
);

export const SkeletonDashboard: React.FC = () => (
  <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }} aria-busy="true" aria-label="Loading dashboard">
    <div className="ff-card p-6 sm:p-8 space-y-3">
      <SkeletonBlock className="h-3.5 w-36" />
      <SkeletonBlock className="h-7 w-72 max-w-full" />
      <SkeletonBlock className="h-4 w-96 max-w-full" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 'var(--ff-grid-gap)' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="ff-card space-y-3">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-7 w-28" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--ff-grid-gap)' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="ff-card space-y-3">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-7 w-32" />
          <SkeletonBlock className="h-3 w-28" />
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="divide-y ff-divider" aria-busy="true" aria-label="Loading records">
    {Array.from({ length: rows }).map((_, idx) => (
      <div
        key={idx}
        className="flex items-center justify-between gap-4"
        style={{ padding: 'var(--ff-row-pad)' }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <SkeletonBlock className="w-9 h-9 rounded-xl shrink-0" />
          <div className="space-y-2 flex-1 max-w-xs">
            <SkeletonBlock className="h-3.5 w-3/4" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
        </div>
        <SkeletonBlock className="h-5 w-20 shrink-0" />
      </div>
    ))}
  </div>
);

interface EmptyStateIllustrationProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyStateIllustration: React.FC<EmptyStateIllustrationProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  const { isDisabled } = useMotionPreferences();

  return (
    <motion.div
      initial={isDisabled ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION_DURATION.card, ease: MOTION_EASING.natural }}
      className="p-10 sm:p-12 text-center flex flex-col items-center justify-center"
    >
      <div className="relative mb-3">
        <motion.div
          animate={
            isDisabled
              ? undefined
              : { scale: [1, 1.08, 1], opacity: [0.35, 0.65, 0.35] }
          }
          transition={
            isDisabled
              ? undefined
              : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }
          }
          className="absolute inset-0 rounded-full"
          style={{
            background: 'var(--ff-accent-soft)',
            filter: 'blur(8px)',
          }}
          aria-hidden="true"
        />
        <div
          className="relative w-14 h-14 rounded-2xl flex items-center justify-center border"
          style={{
            background: 'var(--ff-surface-elevated)',
            borderColor: 'var(--ff-border-color)',
            color: 'var(--ff-accent-text)',
            boxShadow: 'var(--ff-shadow-card)',
          }}
        >
          {icon}
        </div>
      </div>
      <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">{title}</h3>
      <p className="text-xs text-[var(--ff-text-muted)] mt-1 max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
};

interface ConfirmationBurstProps {
  show: boolean;
  label?: string;
}

export const ConfirmationBurst: React.FC<ConfirmationBurstProps> = ({ show, label }) => {
  const { intensity, isDisabled } = useMotionPreferences();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={isDisabled ? { opacity: 1 } : { opacity: 0, scale: 0.88, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -4 }}
          transition={getSpringTransition(intensity, isDisabled)}
          role="status"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border"
          style={{
            background: 'var(--ff-success-soft)',
            borderColor: 'color-mix(in oklab, var(--ff-success) 45%, transparent)',
            color: 'var(--ff-success)',
          }}
        >
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-white shrink-0"
            style={{ background: 'var(--ff-success)' }}
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </span>
          {label && <span>{label}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface ValidationMessageProps {
  message?: string | null;
  tone?: 'error' | 'success';
}

export const ValidationMessage: React.FC<ValidationMessageProps> = ({
  message,
  tone = 'error',
}) => {
  const { isDisabled } = useMotionPreferences();

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={isDisabled ? { opacity: 1 } : { opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -4, height: 0 }}
          transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASING.natural }}
          role={tone === 'error' ? 'alert' : 'status'}
          className="overflow-hidden"
        >
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border mt-1"
            style={{
              background: tone === 'error' ? 'var(--ff-danger-soft)' : 'var(--ff-success-soft)',
              borderColor:
                tone === 'error'
                  ? 'color-mix(in oklab, var(--ff-danger) 35%, transparent)'
                  : 'color-mix(in oklab, var(--ff-success) 35%, transparent)',
              color: tone === 'error' ? 'var(--ff-danger)' : 'var(--ff-success)',
            }}
          >
            {tone === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface ThemeTooltipProps {
  content: string;
  children: React.ReactNode;
}

export const ThemeTooltip: React.FC<ThemeTooltipProps> = ({ content, children }) => {
  const [open, setOpen] = useState(false);
  const { isDisabled } = useMotionPreferences();

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            role="tooltip"
            initial={isDisabled ? { opacity: 1 } : { opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: MOTION_DURATION.overlay, ease: MOTION_EASING.natural }}
            className="ff-card-elevated pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap z-50"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export interface AnimatedProgressBarProps {
  value: number;
  max?: number;
  heightClass?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  customColor?: string;
  showShimmer?: boolean;
  pulsing?: boolean;
  className?: string;
  barClassName?: string;
  ariaLabel?: string;
}

export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  value,
  max = 100,
  heightClass = 'h-2',
  tone = 'accent',
  customColor,
  showShimmer = false,
  pulsing = false,
  className = '',
  barClassName = '',
  ariaLabel,
}) => {
  const { intensity, isDisabled } = useMotionPreferences();
  const safeMax = Math.max(1, Number.isFinite(max) ? max : 100);
  const safeVal = Math.max(0, Number.isFinite(value) ? value : 0);
  const percent = Math.min(100, Math.round((safeVal / safeMax) * 100));

  const fillColor =
    customColor ||
    (tone === 'success'
      ? 'var(--ff-success)'
      : tone === 'warning'
      ? 'var(--ff-warning)'
      : tone === 'danger'
      ? 'var(--ff-danger)'
      : tone === 'neutral'
      ? 'var(--ff-text-muted)'
      : 'var(--ff-accent)');

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={`relative w-full overflow-hidden rounded-full bg-[var(--ff-surface-subtle)] ${heightClass} ${className}`.trim()}
    >
      <motion.div
        className={`h-full rounded-full relative overflow-hidden ${barClassName}`.trim()}
        initial={isDisabled ? false : { width: '0%' }}
        animate={{
          width: `${percent}%`,
          opacity: pulsing && !isDisabled ? [1, 0.72, 1] : 1,
        }}
        transition={{
          width: getSpringTransition(intensity, isDisabled),
          opacity:
            pulsing && !isDisabled
              ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
              : undefined,
        }}
        style={{
          backgroundColor: fillColor,
        }}
      >
        {showShimmer && !isDisabled && percent > 0 && (
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(110deg, transparent 20%, rgba(255, 255, 255, 0.45) 50%, transparent 80%)',
              width: '100%',
            }}
            animate={{
              x: ['-100%', '150%'],
            }}
            transition={{
              repeat: Infinity,
              duration: 2.2,
              ease: 'easeInOut',
              repeatDelay: 0.8,
            }}
          />
        )}
      </motion.div>
    </div>
  );
};

export interface MotionTabIndicatorProps {
  layoutId?: string;
  className?: string;
  style?: React.CSSProperties;
  transition?: Transition;
}

export const MotionTabIndicator: React.FC<MotionTabIndicatorProps> = ({
  layoutId = 'motion-tab-indicator',
  className = '',
  style,
  transition,
}) => {
  const { intensity, isDisabled, styleId } = useMotionPreferences();
  return (
    <motion.div
      layoutId={layoutId}
      transition={transition || getSpringTransition(intensity, isDisabled, styleId)}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
};

export interface AnimatedCheckmarkProps {
  checked: boolean;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}

export const AnimatedCheckmark: React.FC<AnimatedCheckmarkProps> = ({
  checked,
  size = 18,
  strokeWidth = 2.5,
  color = 'currentColor',
  className = '',
}) => {
  const { isDisabled } = useMotionPreferences();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <motion.path
        d="M4.5 12.75l6 6 9-13.5"
        initial={false}
        animate={{
          pathLength: checked ? 1 : 0,
          opacity: checked ? 1 : 0,
        }}
        transition={{
          duration: isDisabled ? 0.01 : MOTION_DURATION.control,
          ease: MOTION_EASING.decelerate,
        }}
      />
    </svg>
  );
};

interface RollingTimerDigitsProps {
  value: string;
  className?: string;
}

/**
 * Per-character rolling tabular digit readout. Each digit transitions vertically
 * in-place inside a clipped slot while maintaining strict tabular alignment.
 */
export const RollingTimerDigits: React.FC<RollingTimerDigitsProps> = ({
  value,
  className = '',
}) => {
  const { isDisabled, profile } = useMotionPreferences();

  if (isDisabled) {
    return <span className={`tabular-nums ${className}`.trim()}>{value}</span>;
  }

  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`.trim()}>
      {Array.from(value).map((ch, idx) => {
        const isDigit = ch >= '0' && ch <= '9';
        if (!isDigit) {
          return (
            <span key={`sep-${idx}`} className="inline-block opacity-85 px-[0.02em]">
              {ch}
            </span>
          );
        }
        return (
          <span
            key={`slot-${idx}`}
            className="relative inline-flex justify-center overflow-hidden leading-none"
            style={{ width: '0.62em', height: '1.08em' }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${idx}-${ch}`}
                initial={{ y: '45%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-45%', opacity: 0 }}
                transition={profile.microSpring}
                className="inline-block leading-none"
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
};

interface SkeletonCrossfadeProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  contentKey?: string;
}

export const SkeletonCrossfade: React.FC<SkeletonCrossfadeProps> = ({
  loading,
  skeleton,
  children,
  contentKey = 'loaded',
}) => {
  const { isDisabled } = useMotionPreferences();

  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div
          key="skeleton-state"
          initial={isDisabled ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={isDisabled ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: isDisabled ? 0.01 : 0.14, ease: MOTION_EASING.decelerate }}
        >
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key={contentKey}
          initial={isDisabled ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={isDisabled ? { opacity: 0 } : { opacity: 0 }}
          transition={{ duration: isDisabled ? 0.01 : 0.2, ease: MOTION_EASING.decelerate }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
