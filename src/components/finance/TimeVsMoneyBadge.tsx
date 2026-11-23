import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { calculateTimeVsMoney } from '../../lib/timeVsMoney.ts';
import { Clock } from 'lucide-react';

interface TimeVsMoneyBadgeProps {
  amountPaise?: number;
  amountRupees?: number;
  className?: string;
}

export const TimeVsMoneyBadge: React.FC<TimeVsMoneyBadgeProps> = ({
  amountPaise,
  amountRupees,
  className = '',
}) => {
  const { settings } = useApp();

  // If feature is disabled or rate is not configured, do not render
  if (settings?.timeVsMoneyEnabled === false) {
    return null;
  }

  const hourlyRate = settings?.hourlyEarningRate || 250; // default ₹250/hr if unconfigured
  const amount = amountRupees !== undefined ? amountRupees : (amountPaise || 0) / 100;

  const result = calculateTimeVsMoney(amount, hourlyRate);
  if (!result || result.workHours <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 select-none ${className}`.trim()}
      title={`Equivalent labor cost: ${result.humanizedString} at ₹${hourlyRate}/hr earning rate`}
    >
      <Clock className="w-2.5 h-2.5 shrink-0" />
      <span>≈ {result.humanizedString}</span>
    </span>
  );
};

