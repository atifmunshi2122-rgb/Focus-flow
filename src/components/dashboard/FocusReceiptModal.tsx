import React, { useState, useRef } from 'react';
import { FocusReceiptData } from '../../types/features15.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Download,
  Share2,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  Receipt,
  Printer,
} from 'lucide-react';

interface FocusReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: FocusReceiptData;
}

export const FocusReceiptModal: React.FC<FocusReceiptModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [hideFinancials, setHideFinancials] = useState<boolean>(data.hideFinancials || false);
  const [isCopied, setIsCopied] = useState(false);
  const receiptCardRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const handleDownloadImage = () => {
    const canvas = document.createElement('canvas');
    const width = 480;
    const height = hideFinancials ? 580 : 680;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Thermal receipt ivory/paper background
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#171717';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FOCUSFLOW & FINANCE', width / 2, 40);

    ctx.font = '12px monospace';
    ctx.fillText('DAILY PRODUCTIVITY RECEIPT', width / 2, 60);
    ctx.fillText('=========================================', width / 2, 80);

    ctx.textAlign = 'left';
    ctx.font = '12px monospace';
    ctx.fillText(`DATE: ${data.date}`, 30, 110);
    ctx.fillText(`USER: ${data.userName || 'Student'}`, 30, 130);
    ctx.fillText(`TERMINAL: #FF-V18-STATION`, 30, 150);
    ctx.fillText('-----------------------------------------', 30, 170);

    let y = 195;
    ctx.fillText('METRIC                       VALUE', 30, y);
    y += 20;
    ctx.fillText('-----------------------------------------', 30, y);
    y += 25;

    ctx.fillText(`DEEP WORK FOCUS              ${data.totalPomodoroMinutes} MIN`, 30, y);
    y += 22;
    ctx.fillText(`POMODORO SESSIONS            ${data.pomodoroSessionsCount} SESS`, 30, y);
    y += 22;
    ctx.fillText(`STUDY LOGGED                 ${data.totalStudyMinutes} MIN`, 30, y);
    y += 22;
    ctx.fillText(`TASKS COMPLETED              ${data.completedTasksCount} ITEMS`, 30, y);
    y += 22;
    ctx.fillText(`ACTIVE FLOW STREAK           ${data.currentStreak} DAYS`, 30, y);
    y += 25;

    if (!hideFinancials && (data.moneySavedPaise !== undefined || data.dailyExpensePaise !== undefined)) {
      ctx.fillText('-----------------------------------------', 30, y);
      y += 25;
      const expense = ((data.dailyExpensePaise || 0) / 100).toFixed(2);
      const saved = ((data.moneySavedPaise || 0) / 100).toFixed(2);
      ctx.fillText(`DAILY EXPENSES               ${data.currency || '₹'} ${expense}`, 30, y);
      y += 22;
      ctx.fillText(`SAVED CAPITAL                ${data.currency || '₹'} ${saved}`, 30, y);
      y += 25;
    }

    ctx.fillText('=========================================', 30, y);
    y += 25;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`PRODUCTIVITY SCORE:          ${data.productivityScore} / 100`, 30, y);
    y += 35;

    // Barcode mock
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('|||| ||| |||||| |||| |||||| |||||', width / 2, y);
    y += 22;
    ctx.font = '10px monospace';
    ctx.fillText('THANK YOU FOR BUILDING YOUR FUTURE', width / 2, y);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `focusflow-receipt-${data.date}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `FocusFlow Daily Receipt - ${data.date}`,
          text: `Today on FocusFlow: ${data.totalPomodoroMinutes}m Deep Focus, ${data.completedTasksCount} tasks completed, ${data.currentStreak} day streak! Score: ${data.productivityScore}/100.`,
        });
      } catch {
        // Share cancelled or unavailable
      }
    } else {
      await navigator.clipboard.writeText(
        `FocusFlow Receipt (${data.date})\nDeep Focus: ${data.totalPomodoroMinutes}m\nTasks: ${data.completedTasksCount}\nStreak: ${data.currentStreak} days\nScore: ${data.productivityScore}/100`
      );
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-5 space-y-4 shadow-2xl">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
              <Receipt className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Today's Focus Receipt</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setHideFinancials(!hideFinancials)}
              className="p-1.5 rounded-lg text-xs font-medium text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)] flex items-center gap-1"
              title={hideFinancials ? 'Show Financials' : 'Hide Financials'}
            >
              {hideFinancials ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{hideFinancials ? 'Private' : 'Show All'}</span>
            </button>
            <button
              onClick={onClose}
              className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Thermal Supermarket Receipt Container */}
        <div
          ref={receiptCardRef}
          className="relative mx-auto w-full max-w-sm rounded-lg bg-[#faf8f5] text-neutral-900 font-mono text-xs p-6 shadow-md border-t-4 border-dashed border-neutral-300 border-b-4 select-none"
        >
          {/* Header */}
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-neutral-400">
            <div className="font-extrabold text-sm tracking-wider">FOCUSFLOW & FINANCE</div>
            <div className="text-[10px] tracking-widest text-neutral-600">DAILY PRODUCTIVITY RECEIPT</div>
            <div className="text-[9px] text-neutral-500 pt-1">
              DATE: {data.date} • TERMINAL: #FF-01
            </div>
          </div>

          {/* User info */}
          <div className="py-2.5 text-[11px] space-y-0.5 border-b border-dashed border-neutral-400">
            <div className="flex justify-between">
              <span className="text-neutral-500">USER:</span>
              <span className="font-bold">{data.userName || 'FocusFlow Member'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">STATION:</span>
              <span>Personal Knowledge Station</span>
            </div>
          </div>

          {/* Line items */}
          <div className="py-3 space-y-2 border-b border-dashed border-neutral-400 text-[11px]">
            <div className="flex justify-between">
              <span>DEEP WORK FOCUS</span>
              <span className="font-bold">{data.totalPomodoroMinutes} MIN</span>
            </div>
            <div className="flex justify-between">
              <span>POMODORO SESSIONS</span>
              <span className="font-bold">{data.pomodoroSessionsCount} SESS</span>
            </div>
            <div className="flex justify-between">
              <span>STUDY LOGGED</span>
              <span className="font-bold">{data.totalStudyMinutes} MIN</span>
            </div>
            <div className="flex justify-between">
              <span>TASKS COMPLETED</span>
              <span className="font-bold">{data.completedTasksCount} ITEMS</span>
            </div>
            <div className="flex justify-between">
              <span>ACTIVE FLOW STREAK</span>
              <span className="font-bold text-emerald-700">{data.currentStreak} DAYS 🔥</span>
            </div>

            {!hideFinancials && (data.moneySavedPaise !== undefined || data.dailyExpensePaise !== undefined) && (
              <>
                <div className="pt-2 border-t border-dotted border-neutral-300" />
                <div className="flex justify-between text-neutral-700">
                  <span>DAILY EXPENDITURE</span>
                  <span className="font-mono">
                    {data.currency || '₹'} {((data.dailyExpensePaise || 0) / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>CAPITAL CONSERVED</span>
                  <span className="font-mono">
                    {data.currency || '₹'} {((data.moneySavedPaise || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Total Productivity Score */}
          <div className="py-3 text-center space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              Productivity Index
            </div>
            <div className="text-2xl font-black tracking-tight text-neutral-900">
              {data.productivityScore} <span className="text-xs font-normal text-neutral-500">/ 100</span>
            </div>
          </div>

          {/* Barcode & Footer */}
          <div className="pt-2 text-center border-t border-dashed border-neutral-400 space-y-1.5">
            <div className="text-lg tracking-[0.25em] text-neutral-800 font-mono select-none">
              ||| | ||||| || |||||| | |||
            </div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500">
              KEEP BUILDING. THE COMPOUND EFFECT IS REAL.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <ThemeButton variant="secondary" size="sm" onClick={handleShare}>
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Copied!
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 mr-1" />
                Share Receipt
              </>
            )}
          </ThemeButton>

          <ThemeButton variant="primary" size="sm" onClick={handleDownloadImage}>
            <Download className="w-3.5 h-3.5 mr-1" />
            Download PNG
          </ThemeButton>
        </div>
      </div>
    </div>
  );
};

