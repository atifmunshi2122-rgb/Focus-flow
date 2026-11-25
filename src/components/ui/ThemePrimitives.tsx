import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';

let cachedSupportsDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (cachedSupportsDisplayTransition !== undefined) return cachedSupportsDisplayTransition;
  if (
    typeof window === 'undefined' ||
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedSupportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedSupportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

interface ThemeCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'inset' | 'hero' | 'interactive' | '3d' | 'glass';
  noPadding?: boolean;
  tilt?: boolean;
}

export const ThemeCard: React.FC<ThemeCardProps> = ({
  variant = 'default',
  noPadding = false,
  tilt,
  className = '',
  children,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReduced = Boolean(useReducedMotion());
  const [tiltState, setTiltState] = useState<{ rx: number; ry: number; active: boolean }>({
    rx: 0,
    ry: 0,
    active: false,
  });

  const is3D = (variant === '3d' || variant === 'interactive' || tilt === true) && tilt !== false;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    props.onPointerMove?.(e);
    // Strict touch protection: 3D tilt is strictly mouse-only, disabled on touch/pen
    if (!is3D || prefersReduced || e.pointerType !== 'mouse' || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    // Restrained, premium tilt angle: ±2.4 degrees
    setTiltState({
      rx: (0.5 - py) * 4.8,
      ry: (px - 0.5) * 4.8,
      active: true,
    });
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    props.onPointerLeave?.(e);
    if (!is3D) return;
    setTiltState({ rx: 0, ry: 0, active: false });
  };

  const variantClass =
    variant === 'hero'
      ? 'ff-hero-banner'
      : variant === '3d'
      ? 'ff-card-3d ff-card-interactive'
      : variant === 'glass'
      ? 'ff-glass-panel'
      : variant === 'elevated'
      ? 'ff-card ff-card-elevated'
      : variant === 'inset'
      ? 'ff-card-inset'
      : variant === 'interactive'
      ? 'ff-card ff-card-interactive'
      : 'ff-card';

  const dynamicTiltStyle: React.CSSProperties | undefined =
    is3D && tiltState.active
      ? {
          transform: `perspective(900px) rotateX(${tiltState.rx.toFixed(2)}deg) rotateY(${tiltState.ry.toFixed(2)}deg) translateY(-2px)`,
          transition: 'transform 0.12s ease-out',
          willChange: 'transform',
          ...props.style,
        }
      : props.style;

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`${variantClass} ${noPadding ? 'ff-card-compact' : ''} ${className}`.trim()}
      style={dynamicTiltStyle}
      {...props}
    >
      {children}
    </div>
  );
};

interface ThemeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  success?: boolean;
  loadingText?: string;
}

export const ThemeButton: React.FC<ThemeButtonProps> = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  success = false,
  loadingText,
  disabled,
  className = '',
  children,
  style,
  ...props
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const sizeClass =
    size === 'xs'
      ? 'px-2.5 py-1 text-[11px]'
      : size === 'sm'
      ? 'px-3 py-1.5 text-xs'
      : size === 'lg'
      ? 'px-6 py-3 text-sm'
      : 'px-4 py-2 text-xs';

  const variantClass =
    variant === 'primary'
      ? 'ff-btn ff-btn-primary'
      : variant === 'secondary'
      ? 'ff-btn ff-btn-secondary'
      : variant === 'ghost'
      ? 'ff-btn ff-btn-ghost'
      : 'ff-btn';

  const effectiveStyle: React.CSSProperties | undefined =
    success
      ? {
          background: 'var(--ff-success)',
          color: '#ffffff',
          border: 'var(--ff-border-width) solid transparent',
          boxShadow: 'var(--ff-shadow-button)',
          ...style,
        }
      : variant === 'success'
      ? {
          background: 'var(--ff-success)',
          color: '#ffffff',
          border: 'var(--ff-border-width) solid transparent',
          boxShadow: 'var(--ff-shadow-button)',
          ...style,
        }
      : variant === 'danger'
      ? {
          background: 'var(--ff-danger)',
          color: '#ffffff',
          border: 'var(--ff-border-width) solid transparent',
          boxShadow: 'var(--ff-shadow-button)',
          ...style,
        }
      : style;

  return (
    <motion.button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileHover={prefersReduced || disabled || loading ? undefined : { y: -1 }}
      whileTap={prefersReduced || disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      className={`${variantClass} ${sizeClass} ${className}`.trim()}
      style={effectiveStyle}
      {...(props as any)}
    >
      {loading && <progress aria-label="Loading" className="ff-spinner shrink-0" />}
      {!loading && success && <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />}
      {loading && loadingText ? <span>{loadingText}</span> : children}
    </motion.button>
  );
};

export const ThemeInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = '',
  ...props
}) => {
  return <input className={`ff-input px-3 py-2 text-sm ${className}`.trim()} {...props} />;
};

export const ThemeSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <select className={`ff-input px-3 py-2 text-sm ${className}`.trim()} {...props}>
      {children}
    </select>
  );
};

export const ThemeTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className = '',
  ...props
}) => {
  return <textarea className={`ff-input px-3 py-2 text-sm ${className}`.trim()} {...props} />;
};

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface ThemeSegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  fullWidth?: boolean;
  wrap?: boolean;
}

export function ThemeSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
  fullWidth = false,
  wrap = false,
}: ThemeSegmentedControlProps<T>) {
  const controlId = useId();
  const prefersReduced = Boolean(useReducedMotion());

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`ff-segmented ${fullWidth ? 'w-full' : ''} ${wrap ? 'flex-wrap overflow-visible' : 'overflow-x-auto'} ${className}`.trim()}
    >
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            data-active={isActive ? 'true' : 'false'}
            data-animated-pill="true"
            aria-pressed={isActive}
            onClick={() => onChange(opt.id)}
            className={`ff-segmented-item relative flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs whitespace-nowrap ${
              fullWidth ? 'flex-1' : ''
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={`seg-pill-${controlId}`}
                transition={
                  prefersReduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 460, damping: 34 }
                }
                className="ff-segmented-active-pill"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon}
              <span>{opt.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface ThemeBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export const ThemeBadge: React.FC<ThemeBadgeProps> = ({
  tone = 'neutral',
  className = '',
  style,
  children,
  ...props
}) => {
  const toneStyles: Record<NonNullable<ThemeBadgeProps['tone']>, React.CSSProperties> = {
    accent: {
      background: 'var(--ff-accent-soft)',
      color: 'var(--ff-accent-text)',
      borderColor: 'var(--ff-accent-border)',
    },
    success: {
      background: 'var(--ff-success-soft)',
      color: 'var(--ff-success)',
      borderColor: 'color-mix(in oklab, var(--ff-success) 35%, transparent)',
    },
    warning: {
      background: 'var(--ff-warning-soft)',
      color: 'var(--ff-warning)',
      borderColor: 'color-mix(in oklab, var(--ff-warning) 35%, transparent)',
    },
    danger: {
      background: 'var(--ff-danger-soft)',
      color: 'var(--ff-danger)',
      borderColor: 'color-mix(in oklab, var(--ff-danger) 35%, transparent)',
    },
    info: {
      background: 'var(--ff-info-soft)',
      color: 'var(--ff-info)',
      borderColor: 'color-mix(in oklab, var(--ff-info) 35%, transparent)',
    },
    neutral: {
      background: 'var(--ff-surface-muted)',
      color: 'var(--ff-text-secondary)',
      borderColor: 'var(--ff-border-color)',
    },
  };

  return (
    <span
      className={`ff-badge px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${className}`.trim()}
      style={{ ...toneStyles[tone], ...style }}
      {...props}
    >
      {children}
    </span>
  );
};

interface ThemeProgressBarProps {
  value: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  customColor?: string;
  heightClass?: string;
  label?: string;
}

export const ThemeProgressBar: React.FC<ThemeProgressBarProps> = ({
  value,
  tone = 'accent',
  customColor,
  heightClass = 'h-2.5',
  label,
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const clamped = Math.max(0, Math.min(100, value));
  const fillColor =
    customColor ||
    (tone === 'success'
      ? 'var(--ff-success)'
      : tone === 'warning'
      ? 'var(--ff-warning)'
      : tone === 'danger'
      ? 'var(--ff-danger)'
      : 'var(--ff-accent)');

  return (
    <div
      className={`ff-progress-track w-full ${heightClass}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        className="h-full"
        initial={prefersReduced ? false : { width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={
          prefersReduced
            ? { duration: 0 }
            : { duration: MOTION_DURATION.card + 0.15, ease: MOTION_EASING.natural }
        }
        style={{
          backgroundColor: fillColor,
        }}
      />
    </div>
  );
};

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-md',
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOutsideRef = useRef(false);

  const closeWithAnimation = async (dialog: HTMLDialogElement) => {
    if (!dialog.open) return;
    if (!supportsTopLayerExit() && !dialog.hasAttribute('data-closing')) {
      dialog.setAttribute('data-closing', '');
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 400)),
        ]);
      }
      if (!dialog.hasAttribute('data-closing')) return;
      dialog.removeAttribute('data-closing');
    }
    if (dialog.open) {
      dialog.close();
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.removeAttribute('data-closing');
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      void closeWithAnimation(dialog);
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      dialog.removeAttribute('data-closing');
      if (isOpen) onClose();
    };

    const handleCancel = (e: Event) => {
      if (!supportsTopLayerExit()) {
        e.preventDefault();
        void closeWithAnimation(dialog);
      }
    };

    const isPointerOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      pressedOutsideRef.current = isPointerOutside(e);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutsideRef.current && isPointerOutside(e)) {
        void closeWithAnimation(dialog);
      }
      pressedOutsideRef.current = false;
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={`ff-dialog ff-card-elevated fixed inset-x-0 bottom-0 top-auto m-0 w-full rounded-t-2xl rounded-b-none sm:relative sm:inset-auto sm:m-auto sm:w-[calc(100%-2rem)] ${maxWidthClass} sm:rounded-[var(--ff-radius-card)] max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain p-0 bg-transparent border-0 text-[var(--ff-text-primary)]`}
      style={{
        background: 'var(--ff-surface-elevated)',
        border: 'var(--ff-border-width) solid var(--ff-border-color)',
        boxShadow: 'var(--ff-shadow-elevated)',
      }}
    >
      <div className="p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Mobile Bottom-Sheet Grab Handle */}
        <div className="sm:hidden w-12 h-1 bg-[var(--ff-border-strong)] rounded-full mx-auto mb-3 opacity-60 shrink-0" />

        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--ff-border-color)]">
          <div>
            <h2 id={titleId} className="text-base font-bold text-[var(--ff-text-primary)]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current && void closeWithAnimation(dialogRef.current)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="pt-4">{children}</div>
      </div>
    </dialog>
  );
};
