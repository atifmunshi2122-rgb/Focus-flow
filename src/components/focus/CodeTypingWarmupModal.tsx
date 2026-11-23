import React, { useState, useEffect, useRef, useMemo } from 'react';
import { STATIC_TYPING_SNIPPETS } from '../../lib/typingSnippets.ts';
import { TypingSnippet } from '../../types/features15.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Code2,
  Clock,
  Zap,
  CheckCircle2,
  RotateCcw,
  SkipForward,
  Play,
  Trophy,
} from 'lucide-react';

interface CodeTypingWarmupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartFocus: () => void;
}

export const CodeTypingWarmupModal: React.FC<CodeTypingWarmupModalProps> = ({
  isOpen,
  onClose,
  onStartFocus,
}) => {
  const [selectedSnippetIndex, setSelectedSnippetIndex] = useState(0);
  const snippet = STATIC_TYPING_SNIPPETS[selectedSnippetIndex] || STATIC_TYPING_SNIPPETS[0];

  const [inputVal, setInputVal] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset session
  const resetWarmup = (newSnippetIdx = selectedSnippetIndex) => {
    setSelectedSnippetIndex(newSnippetIdx);
    setInputVal('');
    setSecondsRemaining(60);
    setIsActive(false);
    setIsFinished(false);
  };

  useEffect(() => {
    if (isOpen) {
      resetWarmup();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // 60-second Countdown Loop
  useEffect(() => {
    if (!isActive || isFinished) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsFinished(true);
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, isFinished]);

  // Handle typing input
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isFinished) return;
    if (!isActive) setIsActive(true);

    const val = e.target.value;
    setInputVal(val);

    // If completely typed correctly
    if (val === snippet.code) {
      setIsFinished(true);
      setIsActive(false);
    }
  };

  // Real-time Calculations
  const stats = useMemo(() => {
    const targetCode = snippet.code;
    let correctCount = 0;
    let errorsCount = 0;

    for (let i = 0; i < inputVal.length; i++) {
      if (inputVal[i] === targetCode[i]) {
        correctCount++;
      } else {
        errorsCount++;
      }
    }

    const elapsedSeconds = Math.max(1, 60 - secondsRemaining);
    const minutes = elapsedSeconds / 60;
    const wpm = Math.round((correctCount / 5) / minutes) || 0;
    const accuracy = inputVal.length > 0 ? Math.round((correctCount / inputVal.length) * 100) : 100;

    return {
      correctCount,
      errorsCount,
      wpm,
      accuracy,
      progressPercent: Math.min(100, Math.round((inputVal.length / targetCode.length) * 100)),
    };
  }, [inputVal, snippet.code, secondsRemaining]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
              <Zap className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                60-Second Code-Typing Mental Warmup
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Prime your motor cortex and focus state before entering Pomodoro flow.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* Snippet Selection & Live Metrics */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--ff-text-muted)] font-medium">Snippet:</span>
            <select
              value={selectedSnippetIndex}
              onChange={(e) => resetWarmup(parseInt(e.target.value, 10))}
              disabled={isActive && !isFinished}
              className="px-2.5 py-1 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] font-medium"
            >
              {STATIC_TYPING_SNIPPETS.map((s, idx) => (
                <option key={s.id} value={idx}>
                  {s.title} ({s.language.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Metrics Pill Bar */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{secondsRemaining}s</span>
            </div>
            <div className="px-3 py-1 rounded-xl bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>{stats.wpm} WPM</span>
            </div>
            <div className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold">
              {stats.accuracy}% ACC
            </div>
          </div>
        </div>

        {/* Code Typing Area */}
        <div className="relative rounded-xl border border-[var(--ff-border)] bg-[#090d16] p-4 font-mono text-xs leading-relaxed overflow-hidden">
          {/* Target code display with character comparison */}
          <div className="select-none pointer-events-none whitespace-pre-wrap break-all min-h-[160px]">
            {snippet.code.split('').map((char, idx) => {
              const isTyped = idx < inputVal.length;
              const isCorrect = isTyped && inputVal[idx] === char;
              const isCurrent = idx === inputVal.length;

              let color = 'text-slate-500';
              let bg = '';

              if (isTyped) {
                if (isCorrect) {
                  color = 'text-emerald-400 font-bold';
                } else {
                  color = 'text-rose-400 font-bold';
                  bg = 'bg-rose-500/30 rounded-sm';
                }
              }

              return (
                <span
                  key={idx}
                  className={`${color} ${bg} ${
                    isCurrent ? 'border-b-2 border-sky-400 animate-pulse' : ''
                  }`}
                >
                  {char}
                </span>
              );
            })}
          </div>

          {/* Hidden/Transparent active input overlay */}
          <textarea
            ref={inputRef}
            value={inputVal}
            onChange={handleInputChange}
            disabled={isFinished}
            rows={6}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="absolute inset-0 w-full h-full opacity-0 cursor-text resize-none p-4 font-mono text-xs"
            placeholder="Type code here to start warmup..."
          />
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-[var(--ff-surface-muted)] h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>

        {/* Finished Celebration Banner */}
        {isFinished && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Trophy className="w-5 h-5" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-emerald-300">Warmup Complete!</h4>
                <p className="text-xs text-emerald-400/80">
                  Speed: {stats.wpm} WPM • Accuracy: {stats.accuracy}% • Motor Cortex Primed
                </p>
              </div>
            </div>

            <ThemeButton variant="primary" size="sm" onClick={onStartFocus}>
              Enter Focus Session
              <Play className="w-3.5 h-3.5 ml-1" />
            </ThemeButton>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--ff-border)]">
          <ThemeButton variant="ghost" size="sm" onClick={() => resetWarmup()}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Restart
          </ThemeButton>

          <div className="flex items-center gap-2">
            <ThemeButton variant="secondary" size="sm" onClick={onStartFocus}>
              <SkipForward className="w-3.5 h-3.5 mr-1" />
              Skip & Start Focus
            </ThemeButton>

            {!isFinished && (
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsFinished(true);
                  setIsActive(false);
                }}
              >
                Complete Warmup
              </ThemeButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
