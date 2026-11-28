import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import type { GroupStudySession } from '../../features/social/squad-types.ts';

interface SharedStudyTimerProps {
  session: GroupStudySession;
  onStart?: () => Promise<void>;
  onPause?: () => Promise<void>;
  onResume?: () => Promise<void>;
  onEnd?: () => Promise<void>;
  canControl: boolean;
}

export function calculateRemainingSeconds(session: GroupStudySession, now: number): number {
  if (!session.startedAt) {
    return session.durationSeconds;
  }
  if (session.status === 'completed' || session.status === 'cancelled') {
    return 0;
  }

  const elapsedSeconds = Math.floor((now - session.startedAt) / 1000);
  const pausedSeconds = session.accumulatedPausedSeconds || 0;
  const pausedNow =
    session.status === 'paused' && session.pausedAt
      ? Math.floor((now - session.pausedAt) / 1000)
      : 0;

  return Math.max(0, session.durationSeconds - elapsedSeconds + pausedSeconds + pausedNow);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export default function SharedStudyTimer({
  session,
  onStart,
  onPause,
  onResume,
  onEnd,
  canControl,
}: SharedStudyTimerProps) {
  const { confirmAction, showToast } = useApp();
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoCompletedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (session.status !== 'running' && session.status !== 'paused') {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session.status]);

  const remaining = calculateRemainingSeconds(session, now);

  useEffect(() => {
    if (
      remaining === 0 &&
      session.status === 'running' &&
      canControl &&
      onEnd &&
      autoCompletedIdRef.current !== session.id
    ) {
      autoCompletedIdRef.current = session.id;
      void onEnd().catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to complete squad session';
        setActionError(msg);
        showToast?.(msg, 'error');
      });
    }
  }, [remaining, session.status, session.id, canControl, onEnd, showToast]);

  const runAction = async (fn?: () => Promise<void>) => {
    if (!fn || pending) return;
    setActionError(null);
    setPending(true);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Squad timer action failed';
      setActionError(msg);
      showToast?.(msg, 'error');
    } finally {
      setPending(false);
    }
  };

  const handleConfirmEnd = async () => {
    if (!onEnd || pending) return;
    const confirmed = await confirmAction({
      title: 'End Squad Session?',
      message: 'This will end the live focus session for everyone in your squad.',
      confirmLabel: 'End Session',
      cancelLabel: 'Keep Studying',
      tone: 'danger',
    });
    if (!confirmed) return;
    await runAction(onEnd);
  };

  return (
    <section className="p-4 rounded-2xl bg-gradient-to-br from-[#20243d] to-[#13182b] border border-white/10 text-white space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>👥</span>
          <h3 className="text-sm font-bold">Squad Focus Session</h3>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
          {session.participantIds.length} Participants
        </span>
      </div>

      <div className="text-3xl font-mono font-extrabold tracking-tight text-center py-1" aria-live="off">
        {formatTime(remaining)}
      </div>

      <p className="text-xs text-slate-300 text-center">
        {session.status === 'running'
          ? 'Focus session in progress'
          : session.status === 'paused'
          ? 'Session paused'
          : session.status === 'completed'
          ? 'Session completed'
          : session.status === 'cancelled'
          ? 'Session cancelled'
          : 'Ready to start'}
      </p>

      {canControl && (
        <div className="flex items-center justify-center gap-2 pt-1">
          {session.status === 'scheduled' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void runAction(onStart)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50"
            >
              Start
            </button>
          )}
          {session.status === 'running' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void runAction(onPause)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/80 hover:bg-amber-500 disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {session.status === 'paused' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void runAction(onResume)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/80 hover:bg-emerald-500 disabled:opacity-50"
            >
              Resume
            </button>
          )}
          {(session.status === 'running' || session.status === 'paused') && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void handleConfirmEnd()}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/80 hover:bg-rose-500 disabled:opacity-50"
            >
              End Session
            </button>
          )}
        </div>
      )}

      {actionError && (
        <p className="text-[11px] text-rose-300 text-center">{actionError}</p>
      )}
    </section>
  );
}

