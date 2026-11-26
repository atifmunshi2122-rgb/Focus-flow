import React, { useState, useEffect } from 'react';
import { DoomscrollTaxEntry } from '../../types/features15.ts';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Flame,
  Plus,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  History,
  TrendingDown,
  ArrowRight,
  ShieldAlert,
  Coins,
} from 'lucide-react';

const PLATFORMS = [
  'Instagram / Reels',
  'TikTok',
  'YouTube Shorts',
  'Twitter / X',
  'Reddit',
  'Endless News Feed',
  'Gaming / Other',
];

const SEED_ENTRIES: DoomscrollTaxEntry[] = [
  {
    id: 'tax-1',
    userId: 'user',
    minutes: 45,
    durationMinutes: 45,
    distractionApp: 'Instagram / Reels',
    platform: 'Instagram / Reels',
    ratePerHour: 100,
    amountTaxed: 75,
    taxAmountPaise: 7500, // ₹75.00
    currency: '₹',
    reason: 'Late night algorithmic reel trap',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const DoomscrollTaxJar: React.FC = () => {
  const { user, showToast } = useApp();
  const activeUid = user?.id || 'usr_guest';
  const storageKey = `focusflow_${activeUid}_doomscroll_jar_v1`;

  const [taxRatePer15Min, setTaxRatePer15Min] = useState<number>(25); // ₹25 per 15 min default
  const [transferError, setTransferError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DoomscrollTaxEntry[]>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fallback
      }
    }
    return [];
  });

  // Sync user-scoped storage & backend
  useEffect(() => {
    let isMounted = true;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setEntries(parsed);
      } catch {}
    } else {
      setEntries([]);
    }

    api.getDoomscrollLogs().then((remote) => {
      if (isMounted && Array.isArray(remote)) {
        setEntries(remote);
        try {
          localStorage.setItem(storageKey, JSON.stringify(remote));
        } catch {}
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [notes, setNotes] = useState('');
  const [isTransferredNotice, setIsTransferredNotice] = useState(false);

  const saveState = (updated: DoomscrollTaxEntry[]) => {
    setEntries(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const totalJarAmountPaise = entries.reduce(
    (acc, curr) => acc + (curr.taxAmountPaise ?? Math.round((curr.amountTaxed || 0) * 100)),
    0
  );
  const totalWastedMinutes = entries.reduce(
    (acc, curr) => acc + (curr.durationMinutes ?? curr.minutes ?? 0),
    0
  );

  const handleLogTax = (e: React.FormEvent) => {
    e.preventDefault();
    if (durationMinutes <= 0) return;

    // Calculate penalty: (minutes / 15) * taxRate * 100 paise
    const intervals = durationMinutes / 15;
    const penaltyPaise = Math.round(intervals * taxRatePer15Min * 100);

    const newEntry: DoomscrollTaxEntry = {
      id: `tax-${Date.now()}`,
      userId: activeUid,
      minutes: durationMinutes,
      durationMinutes,
      distractionApp: platform,
      platform,
      ratePerHour: Math.round(taxRatePer15Min * 4),
      amountTaxed: penaltyPaise / 100,
      taxAmountPaise: penaltyPaise,
      currency: '₹',
      notes: notes.trim() || undefined,
      reason: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    saveState([newEntry, ...entries]);
    api.saveDoomscrollLog(newEntry).catch(() => {});
    setNotes('');
  };

  const handleEmptyJar = async () => {
    if (totalJarAmountPaise <= 0) return;
    if (!window.confirm('Transfer this Discipline Jar balance to your active Savings Goal?')) return;
    setTransferError(null);
    try {
      const goals = await api.getSavingsGoals();
      const targetGoal = Array.isArray(goals) && goals.length > 0 ? goals[0] : undefined;
      if (!targetGoal) {
        const msg = 'No active Savings Goal found. Create a savings goal before transferring your jar balance.';
        setTransferError(msg);
        showToast?.(msg, 'error');
        return;
      }
      await api.updateSavingsGoal(targetGoal.id, {
        savedPaise: (targetGoal.savedPaise || 0) + totalJarAmountPaise,
      });
      setIsTransferredNotice(true);
      saveState([]);
      api.clearDoomscrollLogs().catch(() => {});
      setTimeout(() => setIsTransferredNotice(false), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to transfer Discipline Jar to savings goal';
      setTransferError(msg);
      showToast?.(msg, 'error');
    }
  };

  const handleResetHistory = () => {
    if (!window.confirm('Reset all doomscroll tax entries?')) return;
    saveState([]);
    api.clearDoomscrollLogs().catch(() => {});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <Coins className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">Doomscroll Self-Tax Jar</h2>
            <ThemeBadge tone="danger">v1.8 Discipline</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Convert mindless distraction minutes into a self-imposed financial penalty stored in a virtual savings jar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[var(--ff-surface-muted)] px-3 py-1.5 rounded-xl border border-[var(--ff-border)] text-xs">
            <span className="text-[var(--ff-text-muted)]">Tax Rate:</span>
            <input
              type="number"
              min="5"
              max="500"
              value={taxRatePer15Min}
              onChange={(e) => setTaxRatePer15Min(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-14 px-1.5 py-0.5 rounded bg-[var(--ff-surface)] border border-[var(--ff-border)] text-center font-bold text-[var(--ff-text-primary)]"
            />
            <span className="text-[var(--ff-text-muted)]">₹ / 15m</span>
          </div>

          <ThemeButton variant="ghost" size="sm" onClick={handleResetHistory} title="Reset History">
            <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
          </ThemeButton>
        </div>
      </div>

      {/* Jar Balance Cockpit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-rose-500/30 space-y-1">
          <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">
            Accumulated Discipline Jar
          </span>
          <div className="text-3xl font-bold font-mono text-[var(--ff-text-primary)]">
            ₹ {(totalJarAmountPaise / 100).toFixed(2)}
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            Self-imposed penalty for distraction time.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-1">
          <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
            Distraction Time Wasted
          </span>
          <div className="text-3xl font-bold font-mono text-amber-300">
            {totalWastedMinutes} <span className="text-sm font-normal text-[var(--ff-text-muted)]">mins</span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)]">
            {Math.round((totalWastedMinutes / 60) * 10) / 10} hours surrendered to algorithms.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-emerald-500/30 flex flex-col justify-between space-y-2">
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
              Discipline Redirection
            </span>
            <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
              Transfer this accumulated penalty into your actual emergency fund or investment account.
            </p>
          </div>

          <ThemeButton
            variant="primary"
            size="sm"
            disabled={totalJarAmountPaise === 0}
            onClick={handleEmptyJar}
          >
            Transfer to Savings Goal
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </ThemeButton>
        </div>
      </div>

      {/* Transfer Notice / Error */}
      {transferError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{transferError}</span>
        </div>
      )}

      {isTransferredNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>
            Discipline Jar emptied! Reward your future self by allocating this exact amount to your savings goal.
          </span>
        </div>
      )}

      {/* Log Distraction Form */}
      <div className="p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
        <h3 className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider">
          Log Mindless Scrolling Episode
        </h3>

        <form onSubmit={handleLogTax} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Duration (Minutes)</label>
            <input
              type="number"
              min="5"
              step="5"
              max="600"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 5)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] font-mono"
            />
          </div>

          <div>
            <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Trigger / Context</label>
            <input
              type="text"
              placeholder="e.g. Procrastinating on algorithms assignment"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
            />
          </div>

          <div className="flex items-end">
            <ThemeButton type="submit" variant="danger" size="sm" className="w-full">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Tax Self: ₹ {((durationMinutes / 15) * taxRatePer15Min).toFixed(2)}
            </ThemeButton>
          </div>
        </form>
      </div>

      {/* Tax Ledger History */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-[var(--ff-text-muted)] uppercase tracking-wider flex items-center justify-between">
          <span>Discipline History Ledger</span>
          <span>{entries.length} Episodes Recorded</span>
        </div>

        {entries.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-muted)]">
            Zero doomscroll penalties on record. Keep this streak alive!
          </div>
        ) : (
          <div className="divide-y divide-[var(--ff-border)] rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] overflow-hidden">
            {entries.map((entry) => (
              <div key={entry.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--ff-text-primary)]">{entry.platform}</span>
                    <ThemeBadge tone="danger">{entry.durationMinutes} mins</ThemeBadge>
                  </div>
                  {entry.reason && <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">{entry.reason}</p>}
                </div>

                <div className="text-right">
                  <div className="font-bold font-mono text-rose-400">
                    + ₹ {((entry.taxAmountPaise ?? Math.round(entry.amountTaxed * 100)) / 100).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                    {entry.createdAt.split('T')[0]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="p-3.5 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[11px] text-[var(--ff-text-muted)] flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
        <span>
          <strong>Simulated Self-Accountability Notice:</strong> This jar is a psychological commitment device. No real
          financial transaction is executed by FocusFlow. Users are encouraged to manually transfer this sum to their
          savings or investment accounts.
        </span>
      </div>
    </div>
  );
};
