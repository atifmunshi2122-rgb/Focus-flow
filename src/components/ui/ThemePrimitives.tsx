import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ThemeCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'inset' | 'hero' | 'interactive';
  noPadding?: boolean;
}

export const ThemeCard: React.FC<ThemeCardProps> = ({
  variant = 'default',
  noPadding = false,
  className = '',
  children,
  ...props
}) => {
  const variantClass =
    variant === 'hero'
      ? 'ff-hero-banner'
      : variant === 'elevated'
      ? 'ff-card ff-card-elevated'
      : variant === 'inset'
      ? 'ff-card-inset'
      : variant === 'interactive'
      ? 'ff-card ff-card-interactive'
      : 'ff-card';

  return (
    <div
      className={`${variantClass} ${noPadding ? 'ff-card-compact' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
};

interface ThemeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const ThemeButton: React.FC<ThemeButtonProps> = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  children,
  style,
  ...props
}) => {
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

  const semanticStyle: React.CSSProperties | undefined =
    variant === 'success'
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
    <button
      type={type}
      className={`${variantClass} ${sizeClass} ${className}`.trim()}
      style={semanticStyle}
      {...props}
    >
      {children}
    </button>
  );
};

export const ThemeInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = '',
  ...props
}) => {
  return (
    <input
      className={`ff-input px-3 py-2 text-sm ${className}`.trim()}
      {...props}
    />
  );
};

export const ThemeSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <select
      className={`ff-input px-3 py-2 text-sm ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
};

export const ThemeTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className = '',
  ...props
}) => {
  return (
    <textarea
      className={`ff-input px-3 py-2 text-sm ${className}`.trim()}
      {...props}
    />
  );
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
}

export function ThemeSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
  fullWidth = false,
}: ThemeSegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`ff-segmented ${fullWidth ? 'w-full' : ''} overflow-x-auto ${className}`.trim()}
    >
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            data-active={isActive ? 'true' : 'false'}
            aria-pressed={isActive}
            onClick={() => onChange(opt.id)}
            className={`ff-segmented-item flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs whitespace-nowrap ${
              fullWidth ? 'flex-1' : ''
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
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
      className={`ff-badge px-2 py-0.5 text-[10px] uppercase tracking-wider ${className}`.trim()}
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
      <div
        className="h-full transition-all duration-500"
        style={{
          width: `${clamped}%`,
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      if (isOpen) onClose();
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
        dialog.close();
      }
      pressedOutsideRef.current = false;
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={`ff-card-elevated w-[calc(100%-2rem)] ${maxWidthClass} p-0 bg-transparent border-0 text-[var(--ff-text-primary)]`}
      style={{
        background: 'var(--ff-surface-elevated)',
        border: 'var(--ff-border-width) solid var(--ff-border-color)',
        borderRadius: 'var(--ff-radius-card)',
        boxShadow: 'var(--ff-shadow-elevated)',
      }}
    >
      <div className="p-6">
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
            onClick={() => dialogRef.current?.close()}
            className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors shrink-0"
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
