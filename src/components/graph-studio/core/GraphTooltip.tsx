import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMotionPreferences } from '../../ui/MotionPrimitives.tsx';

export interface TooltipItem {
  label: string;
  value: string | number;
  color?: string;
  isDashed?: boolean;
}

export interface GraphTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  title?: string;
  subtitle?: string;
  items: TooltipItem[];
  containerWidth?: number;
}

export const GraphTooltip: React.FC<GraphTooltipProps> = ({
  visible,
  x,
  y,
  title,
  subtitle,
  items,
  containerWidth = 600,
}) => {
  const { isDisabled } = useMotionPreferences();

  if (!visible || items.length === 0) return null;

  // Prevent right-edge overflow
  const isRightHalf = x > containerWidth * 0.65;
  const tooltipWidth = 190;
  const leftPos = isRightHalf ? x - tooltipWidth - 12 : x + 12;

  return (
    <AnimatePresence>
      <motion.div
        initial={isDisabled ? false : { opacity: 0, scale: 0.95, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.12 }}
        className="absolute z-30 pointer-events-none rounded-xl p-3 border shadow-xl backdrop-blur-md text-xs"
        style={{
          left: `${leftPos}px`,
          top: `${Math.max(8, y - 40)}px`,
          width: `${tooltipWidth}px`,
          backgroundColor: 'color-mix(in oklab, var(--ff-surface-card) 92%, black 8%)',
          borderColor: 'var(--ff-border-color)',
          color: 'var(--ff-text-primary)',
        }}
      >
        {title && (
          <div className="font-bold text-xs text-[var(--ff-text-primary)] truncate">
            {title}
          </div>
        )}
        {subtitle && (
          <div className="text-[10px] text-[var(--ff-text-muted)] font-mono mb-1.5 truncate">
            {subtitle}
          </div>
        )}

        <div className="space-y-1 mt-1 border-t border-[var(--ff-border-color)]/60 pt-1.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-[11px] gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: item.color || 'var(--ff-accent)',
                    border: item.isDashed ? '1px dashed var(--ff-border-color)' : undefined,
                  }}
                />
                <span className="text-[var(--ff-text-muted)] truncate">{item.label}</span>
              </div>
              <span className="font-mono font-semibold text-[var(--ff-text-primary)] shrink-0">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
