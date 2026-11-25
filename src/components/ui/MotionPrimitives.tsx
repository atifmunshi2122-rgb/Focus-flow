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
  getAccordionVariants,
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

    return () => {
      controls.stop();
      setDisplayValue(value);
    };
  }, [value, isDisabled, intensity]);

  return <span className={className}>{format(displayValue)}</span>;
};

interface InteractiveSurface3DProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  depth?: 'subtle' | 'standard' | 'pronounced';
  glareOpacity?: number;
}

/**
 * Selective 3D micro-interaction wrapper adding restrained perspective tilt
 * and dynamic light reflection on fine-pointer desktops.
 */
export const InteractiveSurface3D: React.FC<InteractiveSurface3DProps> = ({
  children,
  className = '',
  maxTilt = 2.4,
  depth = 'standard',
  glareOpacity = 0.16,
}) => {
  const { intensity, isDisabled, styleId } = useMotionPreferences();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });

  // Respect Flat, Brutalism, Minimalism, and Reduced/Subtle motion preferences
  const allow3D =
    !isDisabled &&
    intensity !== 'subtle' &&
    !['flat', 'brutalism', 'minimalism', 'editorial'].includes(styleId);

  const depthMultiplier = depth === 'pronounced' ? 1.4 : depth === 'subtle' ? 0.7 : 1;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!allow3D || e.pointerType !== 'mouse' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const mult = (intensity === 'expressive' ? 1.25 : 1) * depthMultiplier;
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
      style={{ perspective: allow3D ? '1200px' : undefined }}
    >
      <div
        className="relative transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform:
            allow3D && tilt.active
              ? `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`
              : undefined,
        }}
      >
        {children}
        {allow3D && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-200 rounded-[inherit]"
            style={{
              opacity: tilt.active ? glareOpacity : 0,
              borderRadius: 'inherit',
              background: `radial-gradient(circle 360px at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.7), transparent 70%)`,
            }}
          />
        )}
      </div>
    </div>
  );
};

interface Realistic3DCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'glass' | '3d';
  maxTilt?: number;
  glowOnHover?: boolean;
  glowColor?: string;
  onClick?: () => void;
}

export const Realistic3DCard: React.FC<Realistic3DCardProps> = ({
  children,
  className = '',
  variant = '3d',
  maxTilt = 2.4,
  glowOnHover = true,
  glowColor,
  onClick,
}) => {
  const cardVariantClass =
    variant === 'glass'
      ? 'ff-glass-panel'
      : variant === 'elevated'
      ? 'ff-card ff-card-elevated'
      : variant === '3d'
      ? 'ff-card-3d'
      : 'ff-card';

  return (
    <InteractiveSurface3D maxTilt={maxTilt} className="h-full">
      <div
        onClick={onClick}
        className={`${cardVariantClass} ff-card-interactive h-full transition-all duration-200 ${
          glowOnHover ? 'hover:border-[var(--ff-border-strong)]' : ''
        } ${className}`.trim()}
        style={glowColor ? ({ '--ff-glow-color': glowColor } as React.CSSProperties) : undefined}
      >
        {children}
      </div>
    </InteractiveSurface3D>
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
  <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading dashboard">
    {/* Compact Command Header Skeleton */}
    <div className="ff-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-2 flex-1">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-6 w-56 max-w-full" />
        <SkeletonBlock className="h-3 w-64 max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-9 w-28 rounded-lg" />
        <SkeletonBlock className="h-9 w-24 rounded-lg" />
      </div>
    </div>
    {/* Daily Snapshot 4-Card KPI Row Skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="ff-card p-4 space-y-2.5">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-7 w-28" />
          <SkeletonBlock className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
    {/* Balanced 6+6 Priorities & Exam Prep Row Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {[1, 2].map((i) => (
        <div key={i} className="lg:col-span-6 ff-card p-4 sm:p-5 space-y-3">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
          <SkeletonBlock className="h-10 w-4/5 rounded-lg" />
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
 * Per-character tabular digit readout. Ensures digits remain 100% visible,
 * centered, and rock-solid during active countdown without layout popping or clipping.
 */
export const RollingTimerDigits: React.FC<RollingTimerDigitsProps> = ({
  value,
  className = '',
}) => {
  return (
    <span className={`inline-flex items-center font-mono tabular-nums select-none ${className}`.trim()}>
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
            className="inline-flex justify-center items-center leading-none"
            style={{ width: '0.62em' }}
          >
            {ch}
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

export interface MotionAccordionProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Smooth collapsible accordion with GPU-accelerated height and opacity transitions.
 * Perfect for subtasks, syllabus modules, and details panels.
 */
export const MotionAccordion: React.FC<MotionAccordionProps> = ({
  isOpen,
  children,
  className = '',
  style,
}) => {
  const { intensity, isDisabled } = useMotionPreferences();
  const variants = getAccordionVariants(intensity, isDisabled);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="accordion-content"
          initial="collapsed"
          animate="expanded"
          exit="collapsed"
          variants={variants}
          className={`overflow-hidden ${className}`.trim()}
          style={style}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export interface MotionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  allowHoverLift?: boolean;
  allowTapScale?: boolean;
}

/**
 * Interactive card wrapper that applies adaptive design-style hover elevation
 * and active tap scale without jarring layout shifts.
 */
export const MotionCard: React.FC<MotionCardProps> = ({
  children,
  className = '',
  allowHoverLift = true,
  allowTapScale = true,
  style,
  ...props
}) => {
  const { intensity, isDisabled, profile } = useMotionPreferences();

  const hoverAnimation =
    !isDisabled && allowHoverLift && intensity !== 'subtle'
      ? { y: profile.hoverLiftPx }
      : undefined;

  const tapAnimation =
    !isDisabled && allowTapScale ? { scale: profile.tapScale } : undefined;

  return (
    <motion.div
      whileHover={hoverAnimation}
      whileTap={tapAnimation}
      transition={profile.spring}
      className={className}
      style={style}
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
};

export interface AnimatedCurrencyProps {
  amountPaise: number;
  currency?: string;
  className?: string;
}

/**
 * Safe animated currency counter for financial values.
 * Animates the numeric value while preserving strict currency symbol formatting.
 */
export const AnimatedCurrency: React.FC<AnimatedCurrencyProps> = ({
  amountPaise,
  currency = 'INR',
  className = '',
}) => {
  const safeAmount = Number.isFinite(amountPaise) ? amountPaise / 100 : 0;
  const { intensity, isDisabled } = useMotionPreferences();
  const prevValRef = useRef<number>(safeAmount);
  const [displayVal, setDisplayVal] = useState<number>(safeAmount);

  useEffect(() => {
    const start = prevValRef.current;
    prevValRef.current = safeAmount;

    if (isDisabled || start === safeAmount) {
      setDisplayVal(safeAmount);
      return;
    }

    const duration = intensity === 'subtle' ? 0.25 : intensity === 'expressive' ? 0.5 : 0.35;
    const controls = animate(start, safeAmount, {
      duration,
      ease: MOTION_EASING.natural,
      onUpdate: (latest) => setDisplayVal(latest),
      onComplete: () => setDisplayVal(safeAmount),
    });

    return () => {
      controls.stop();
      setDisplayVal(safeAmount);
    };
  }, [safeAmount, isDisabled, intensity]);

  const symbol =
    currency === 'INR'
      ? '₹'
      : currency === 'USD'
      ? '$'
      : currency === 'EUR'
      ? '€'
      : currency === 'GBP'
      ? '£'
      : '';
  const formatted = Math.round(displayVal).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <span className={`tabular-nums ${className}`.trim()}>
      {symbol}{formatted}
    </span>
  );
};

export interface SubtleConfettiProps {
  show: boolean;
  onComplete?: () => void;
  className?: string;
  durationMs?: number;
}

/**
 * SubtleConfetti — Lightweight, elegant achievement celebration.
 * Emits ~22 tasteful geometric shapes (gold, emerald, cyan, rose, indigo)
 * that gently burst and flutter down, then unmounts completely.
 * Automatically disabled under prefers-reduced-motion or animation: none.
 */
export const SubtleConfetti: React.FC<SubtleConfettiProps> = ({
  show,
  onComplete,
  className = '',
  durationMs = 1400,
}) => {
  const { isDisabled } = useMotionPreferences();
  const [particles, setParticles] = useState<
    Array<{
      id: number;
      targetX: number;
      targetY: number;
      rotate: number;
      color: string;
      size: number;
      isCircle: boolean;
    }>
  >([]);

  useEffect(() => {
    if (!show || isDisabled) {
      setParticles([]);
      return;
    }

    const colors = [
      '#6366f1', // Indigo
      '#10b981', // Emerald
      '#f59e0b', // Amber / Gold
      '#06b6d4', // Cyan
      '#ec4899', // Rose
      '#8b5cf6', // Violet
    ];

    const generated = Array.from({ length: 22 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 22 + (Math.random() - 0.5) * 0.4;
      const distance = 40 + Math.random() * 80;
      return {
        id: i,
        targetX: Math.cos(angle) * distance,
        targetY: Math.sin(angle) * distance + 35, // downward gravity drift
        rotate: (Math.random() - 0.5) * 720,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 4,
        isCircle: i % 3 === 0,
      };
    });

    setParticles(generated);

    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [show, isDisabled, durationMs, onComplete]);

  if (isDisabled || particles.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none overflow-visible flex items-center justify-center z-30 ${className}`.trim()}
    >
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: p.targetX,
              y: p.targetY,
              scale: [0, 1.2, 0.8],
              opacity: [1, 1, 0],
              rotate: p.rotate,
            }}
            transition={{
              duration: durationMs / 1000,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.isCircle ? p.size : p.size * 1.6,
              borderRadius: p.isCircle ? '50%' : '2px',
              backgroundColor: p.color,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export interface MotionDropdownProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

/**
 * Animated spring-based dropdown container with keyboard and accessibility support.
 */
export const MotionDropdown: React.FC<MotionDropdownProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  align = 'right',
}) => {
  const { isDisabled, profile } = useMotionPreferences();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const alignClass =
    align === 'left' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dropdownRef}
          initial={isDisabled ? { opacity: 1 } : { opacity: 0, scale: 0.95, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
          transition={profile.spring}
          className={`absolute top-full mt-1.5 z-50 ${alignClass} ${className}`.trim()}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export interface MotionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'bottom';
  className?: string;
  title?: string;
}

/**
 * Spring-based accessible drawer with backdrop blur and escape dismissal.
 */
export const MotionDrawer: React.FC<MotionDrawerProps> = ({
  isOpen,
  onClose,
  children,
  side = 'bottom',
  className = '',
  title,
}) => {
  const { isDisabled, profile } = useMotionPreferences();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const initialSlide =
    side === 'bottom'
      ? { y: '100%' }
      : side === 'left'
      ? { x: '-100%' }
      : { x: '100%' };

  const animateSlide = side === 'bottom' ? { y: 0 } : { x: 0 };
  const exitSlide =
    side === 'bottom'
      ? { y: '100%' }
      : side === 'left'
      ? { x: '-100%' }
      : { x: '100%' };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: isDisabled ? 0.01 : MOTION_DURATION.overlay }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50"
            aria-hidden="true"
          />
          <motion.div
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Panel'}
            initial={isDisabled ? false : initialSlide}
            animate={animateSlide}
            exit={isDisabled ? { opacity: 0 } : exitSlide}
            transition={profile.modal}
            className={`fixed z-50 bg-[var(--ff-surface-elevated)] border-[var(--ff-border-color)] shadow-2xl ${
              side === 'bottom'
                ? 'inset-x-0 bottom-0 border-t rounded-t-3xl max-h-[85dvh]'
                : side === 'left'
                ? 'inset-y-0 left-0 border-r w-80 max-w-[85vw]'
                : 'inset-y-0 right-0 border-l w-80 max-w-[85vw]'
            } ${className}`.trim()}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
