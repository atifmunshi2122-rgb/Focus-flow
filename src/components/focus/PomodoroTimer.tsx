import React, { useState } from 'react';
import { useApp, TimerMode } from '../../context/AppContext.tsx';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Sparkles,
  Volume2,
  VolumeX,
  Target,
} from 'lucide-react';

export const PomodoroTimer: React.FC = () => {
  const {
    timerMode,
    timeLeft,
    totalDuration,
    isRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    switchTimerMode,
    activeTask,
    setActiveTaskId,
    setCustomDuration,
    settings,
    updateSettings,
  } = useApp();

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customInputMinutes, setCustomInputMinutes] = useState('25');

  // Format MM:SS
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  // SVG Circular progress math
  const size = 280;
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = totalDuration > 0 ? (totalDuration - timeLeft) / totalDuration : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  const modeColors: Record<TimerMode, { ring: string; glow: string; text: string; bg: string }> = {
    work: {
      ring: '#6366f1', // Indigo
      glow: 'rgba(99, 102, 241, 0.25)',
      text: 'text-indigo-600 dark:text-indigo-400',
      bg: 'from-indigo-500/10 to-violet-500/10',
    },
    short_break: {
      ring: '#10b981', // Emerald
      glow: 'rgba(16, 185, 129, 0.25)',
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'from-emerald-500/10 to-teal-500/10',
    },
    long_break: {
      ring: '#06b6d4', // Cyan
      glow: 'rgba(6, 182, 212, 0.25)',
      text: 'text-cyan-600 dark:text-cyan-400',
      bg: 'from-cyan-500/10 to-blue-500/10',
    },
  };

  const currentTheme = modeColors[timerMode];

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customInputMinutes, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 180) {
      setCustomDuration(parsed);
      setShowCustomModal(false);
    }
  };

  const toggleSound = () => {
    if (settings) {
      updateSettings({ soundEnabled: !settings.soundEnabled });
    }
  };

  const toggleAutoSwitch = () => {
    if (settings) {
      updateSettings({ autoSwitchSessions: !settings.autoSwitchSessions });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
      {/* Mode Switcher Segmented Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl mb-8">
        <button
          onClick={() => switchTimerMode('work')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            timerMode === 'work'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Focus (25m)
        </button>
        <button
          onClick={() => switchTimerMode('short_break')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            timerMode === 'short_break'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Short Break (5m)
        </button>
        <button
          onClick={() => switchTimerMode('long_break')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            timerMode === 'long_break'
              ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Long Break (15m)
        </button>
      </div>

      {/* Linked Task Indicator */}
      {activeTask ? (
        <div className="mb-6 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/90 text-xs font-medium text-slate-700 dark:text-slate-300 max-w-sm truncate border border-slate-200 dark:border-slate-700">
          <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">Focusing on: <strong>{activeTask.title}</strong></span>
          <button
            onClick={() => setActiveTaskId(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1 text-xs"
            title="Unlink task"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Sparkles className="w-3.5 h-3.5 text-slate-400" />
          <span>Independent Session (No task linked)</span>
        </div>
      )}

      {/* Circular Progress Display */}
      <div className="relative flex items-center justify-center my-2">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90 drop-shadow-md"
          style={{
            filter: isRunning ? `drop-shadow(0 0 16px ${currentTheme.glow})` : undefined,
          }}
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke="currentColor"
            className="text-slate-100 dark:text-slate-800"
            fill="transparent"
          />

          {/* Active Animated Progress Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke={currentTheme.ring}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-linear"
          />
        </svg>

        {/* Center Countdown Display */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-5xl font-extrabold tracking-tight font-mono tabular-nums text-slate-900 dark:text-white">
            {timeFormatted}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wider mt-1.5 ${currentTheme.text}`}>
            {timerMode === 'work' ? 'Deep Focus' : timerMode === 'short_break' ? 'Short Pause' : 'Rest & Recharge'}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            {isRunning ? 'Session in progress' : 'Ready to start'}
          </span>
        </div>
      </div>

      {/* Main Action Controls */}
      <div className="flex items-center gap-4 mt-8">
        <button
          onClick={resetTimer}
          className="p-3 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Reset timer"
          aria-label="Reset timer"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          onClick={isRunning ? pauseTimer : startTimer}
          className={`px-8 py-3.5 rounded-full font-bold text-sm text-white shadow-lg transition-all transform active:scale-95 flex items-center gap-2.5 ${
            isRunning
              ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
              : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/25'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="w-5 h-5 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current ml-0.5" />
              <span>{timeLeft < totalDuration ? 'Resume' : 'Start Focus'}</span>
            </>
          )}
        </button>

        <button
          onClick={() => setShowCustomModal(true)}
          className="p-3 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Set custom duration"
          aria-label="Custom duration"
        >
          <Sliders className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Settings Toggles */}
      <div className="flex items-center gap-6 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
        <button
          onClick={toggleSound}
          className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          {settings?.soundEnabled ? (
            <Volume2 className="w-4 h-4 text-indigo-500" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-400" />
          )}
          <span>Sound {settings?.soundEnabled ? 'Enabled' : 'Muted'}</span>
        </button>

        <button
          onClick={toggleAutoSwitch}
          className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <CheckCircle2
            className={`w-4 h-4 ${
              settings?.autoSwitchSessions ? 'text-indigo-500' : 'text-slate-400'
            }`}
          />
          <span>Auto-Switch {settings?.autoSwitchSessions ? 'On' : 'Off'}</span>
        </button>
      </div>

      {/* Custom Duration Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-xs">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Custom Duration</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter target duration in minutes (1 - 180 min)
            </p>
            <form onSubmit={handleCustomSubmit}>
              <input
                type="number"
                min="1"
                max="180"
                value={customInputMinutes}
                onChange={(e) => setCustomInputMinutes(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Set Duration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
