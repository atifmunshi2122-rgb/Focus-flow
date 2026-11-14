/**
 * Production Timer Engine with Sleep/Wake Timestamp Math,
 * LocalStorage State Recovery, and Multi-Tab Broadcast Synchronization.
 */

export type TimerEngineMode = 'pomodoro' | 'short_break' | 'long_break' | 'stopwatch' | 'countdown';
export type TimerMode = 'work' | 'short_break' | 'long_break';

export const TIMER_STORAGE_KEY = 'ff_timer_state_v1';
export const TIMER_BROADCAST_CHANNEL = 'ff_timer_sync_v1';

export interface StoredTimerState {
  version: 1;
  timerEngine: TimerEngineMode;
  timerMode: TimerMode;
  isRunning: boolean;
  timeLeft: number;
  totalDuration: number;
  targetEndTimeMs: number | null;
  stopwatchStartMs: number | null;
  stopwatchElapsed: number;
  sessionStartTime: string | null;
  activeTaskId: string | null;
  lastUpdatedMs: number;
}

export type TimerBroadcastMessage =
  | {
      type: 'TIMER_SYNC_START';
      payload: {
        targetEndTimeMs: number | null;
        stopwatchStartMs: number | null;
        totalDuration: number;
        timerMode: TimerMode;
        timerEngine: TimerEngineMode;
        sessionStartTime: string | null;
        activeTaskId: string | null;
      };
    }
  | {
      type: 'TIMER_SYNC_PAUSE';
      payload: {
        timeLeft: number;
        stopwatchElapsed: number;
        timerEngine: TimerEngineMode;
      };
    }
  | {
      type: 'TIMER_SYNC_RESET';
      payload: {
        totalDuration: number;
        timerEngine: TimerEngineMode;
        timerMode: TimerMode;
      };
    }
  | {
      type: 'TIMER_SYNC_MODE';
      payload: {
        mode: TimerMode;
        durationSecs: number;
      };
    }
  | {
      type: 'TIMER_SYNC_ENGINE';
      payload: {
        engine: TimerEngineMode;
      };
    }
  | {
      type: 'TIMER_SYNC_COMPLETED';
      payload: {
        completionKey: string;
        completedAt: string;
      };
    };

export interface InitialTimerStateResult {
  timerEngine: TimerEngineMode;
  timerMode: TimerMode;
  timeLeft: number;
  totalDuration: number;
  stopwatchElapsed: number;
  isRunning: boolean;
  targetEndTimeMs: number | null;
  stopwatchStartMs: number | null;
  sessionStartTime: string | null;
  activeTaskId: string | null;
}

export function computeRemainingSeconds(targetEndTimeMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.ceil((targetEndTimeMs - nowMs) / 1000));
}

export function computeStopwatchElapsed(stopwatchStartMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - stopwatchStartMs) / 1000));
}

export function formatTimeDisplay(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function loadInitialTimerState(
  storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null,
  nowMs: number = Date.now()
): InitialTimerStateResult {
  const fallback: InitialTimerStateResult = {
    timerEngine: 'pomodoro',
    timerMode: 'work',
    timeLeft: 25 * 60,
    totalDuration: 25 * 60,
    stopwatchElapsed: 0,
    isRunning: false,
    targetEndTimeMs: null,
    stopwatchStartMs: null,
    sessionStartTime: null,
    activeTaskId: null,
  };

  if (!storage) return fallback;

  try {
    const raw = storage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredTimerState>;
    if (!parsed || parsed.version !== 1) return fallback;

    const mode = (parsed.timerMode && ['work', 'short_break', 'long_break'].includes(parsed.timerMode))
      ? parsed.timerMode
      : 'work';
    const engine = (parsed.timerEngine && ['pomodoro', 'short_break', 'long_break', 'stopwatch', 'countdown'].includes(parsed.timerEngine))
      ? parsed.timerEngine
      : 'pomodoro';
    const totalDuration = typeof parsed.totalDuration === 'number' && parsed.totalDuration > 0
      ? parsed.totalDuration
      : 25 * 60;
    const activeTaskId = typeof parsed.activeTaskId === 'string' ? parsed.activeTaskId : null;
    const sessionStartTime = typeof parsed.sessionStartTime === 'string' ? parsed.sessionStartTime : null;

    if (parsed.isRunning) {
      if (engine === 'stopwatch') {
        const startMs = typeof parsed.stopwatchStartMs === 'number' ? parsed.stopwatchStartMs : null;
        if (startMs && startMs <= nowMs) {
          const elapsed = computeStopwatchElapsed(startMs, nowMs);
          return {
            timerEngine: engine,
            timerMode: mode,
            timeLeft: 0,
            totalDuration,
            stopwatchElapsed: elapsed,
            isRunning: true,
            targetEndTimeMs: null,
            stopwatchStartMs: startMs,
            sessionStartTime,
            activeTaskId,
          };
        }
      } else {
        const targetEnd = typeof parsed.targetEndTimeMs === 'number' ? parsed.targetEndTimeMs : null;
        if (targetEnd) {
          if (targetEnd > nowMs) {
            const remaining = computeRemainingSeconds(targetEnd, nowMs);
            return {
              timerEngine: engine,
              timerMode: mode,
              timeLeft: remaining,
              totalDuration,
              stopwatchElapsed: 0,
              isRunning: true,
              targetEndTimeMs: targetEnd,
              stopwatchStartMs: null,
              sessionStartTime,
              activeTaskId,
            };
          } else {
            // Timer expired while page/tab was closed
            return {
              timerEngine: engine,
              timerMode: mode,
              timeLeft: 0,
              totalDuration,
              stopwatchElapsed: 0,
              isRunning: false,
              targetEndTimeMs: null,
              stopwatchStartMs: null,
              sessionStartTime,
              activeTaskId,
            };
          }
        }
      }
    }

    const timeLeft = typeof parsed.timeLeft === 'number' && parsed.timeLeft >= 0
      ? parsed.timeLeft
      : totalDuration;
    const stopwatchElapsed = typeof parsed.stopwatchElapsed === 'number' && parsed.stopwatchElapsed >= 0
      ? parsed.stopwatchElapsed
      : 0;

    return {
      timerEngine: engine,
      timerMode: mode,
      timeLeft,
      totalDuration,
      stopwatchElapsed,
      isRunning: false,
      targetEndTimeMs: null,
      stopwatchStartMs: null,
      sessionStartTime,
      activeTaskId,
    };
  } catch {
    return fallback;
  }
}

export function saveTimerState(
  state: Partial<StoredTimerState>,
  storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null
): void {
  if (!storage) return;
  try {
    const existing = storage.getItem(TIMER_STORAGE_KEY);
    const prev = existing ? JSON.parse(existing) : {};
    const merged: StoredTimerState = {
      version: 1,
      timerEngine: state.timerEngine ?? prev.timerEngine ?? 'pomodoro',
      timerMode: state.timerMode ?? prev.timerMode ?? 'work',
      isRunning: state.isRunning ?? prev.isRunning ?? false,
      timeLeft: state.timeLeft ?? prev.timeLeft ?? 1500,
      totalDuration: state.totalDuration ?? prev.totalDuration ?? 1500,
      targetEndTimeMs: state.targetEndTimeMs !== undefined ? state.targetEndTimeMs : prev.targetEndTimeMs ?? null,
      stopwatchStartMs: state.stopwatchStartMs !== undefined ? state.stopwatchStartMs : prev.stopwatchStartMs ?? null,
      stopwatchElapsed: state.stopwatchElapsed ?? prev.stopwatchElapsed ?? 0,
      sessionStartTime: state.sessionStartTime !== undefined ? state.sessionStartTime : prev.sessionStartTime ?? null,
      activeTaskId: state.activeTaskId !== undefined ? state.activeTaskId : prev.activeTaskId ?? null,
      lastUpdatedMs: Date.now(),
    };
    storage.setItem(TIMER_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function acquireCompletionLock(
  completionKey: string,
  storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null
): boolean {
  if (!storage) return true;
  const lockKey = `ff_comp_lock_${completionKey}`;
  try {
    if (storage.getItem(lockKey)) {
      return false; // Already locked/processed
    }
    storage.setItem(lockKey, Date.now().toString());
    return true;
  } catch {
    return true;
  }
}

export function broadcastTimerEvent(msg: TimerBroadcastMessage): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(TIMER_BROADCAST_CHANNEL);
    ch.postMessage(msg);
    ch.close();
  } catch {
    // Unsupported or blocked
  }
}
