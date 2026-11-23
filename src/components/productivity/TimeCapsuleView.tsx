import React, { useState, useEffect } from 'react';
import { TimeCapsuleLetter } from '../../types/features15.ts';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { getTodayDateString, formatDateInTimezone } from '../../lib/dateTime.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Mail,
  Lock,
  Unlock,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Sparkles,
  Eye,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

/**
 * Letter content formatter:
 * Handles sealed format or displays direct text.
 */
export function revealContent(stored: string): string {
  if (!stored || stored.trim() === '') {
    return '🔒 This letter is sealed until its unlock date. Content is locked on the server and cannot be viewed yet.';
  }
  if (typeof stored === 'string' && stored.startsWith('sealed:v1:')) {
    try {
      return decodeURIComponent(escape(atob(stored.slice(10))));
    } catch {
      return stored.slice(10);
    }
  }
  return stored;
}

export const TimeCapsuleView: React.FC = () => {
  const { user } = useApp();
  const activeUid = user?.id || 'usr_guest';
  const storageKey = `focusflow_${activeUid}_time_capsules_v1`;
  const todayStr = getTodayDateString();

  const [capsules, setCapsules] = useState<TimeCapsuleLetter[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [selectedCapsule, setSelectedCapsule] = useState<TimeCapsuleLetter | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [unlockPreset, setUnlockPreset] = useState<'6m' | '1y' | '3y' | 'custom'>('1y');
  const [customDate, setCustomDate] = useState('');

  // Sync user-scoped storage & backend
  const loadCapsules = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const remote = await api.getTimeCapsules();
      if (Array.isArray(remote)) {
        setCapsules(remote);
        try {
          localStorage.setItem(storageKey, JSON.stringify(remote));
        } catch {}
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load time capsules from server';
      setApiError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCapsules();
  }, [storageKey]);

  const saveState = (updated: TimeCapsuleLetter[]) => {
    setCapsules(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}
  };

  const handleCreateCapsule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    let targetDateStr = customDate;
    const now = Date.now();
    if (unlockPreset === '6m') {
      targetDateStr = formatDateInTimezone(new Date(now + 180 * 86400000));
    } else if (unlockPreset === '1y') {
      targetDateStr = formatDateInTimezone(new Date(now + 365 * 86400000));
    } else if (unlockPreset === '3y') {
      targetDateStr = formatDateInTimezone(new Date(now + 3 * 365 * 86400000));
    }

    if (!targetDateStr) {
      setApiError('Please select a valid unlock date.');
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    const newCapsule: TimeCapsuleLetter = {
      id: `cap-${Date.now()}`,
      userId: activeUid,
      title: title.trim(),
      content: content.trim(),
      unlockDate: targetDateStr,
      isUnlocked: targetDateStr <= todayStr,
      isSealed: targetDateStr > todayStr,
      sealedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    try {
      const saved = await api.saveTimeCapsule(newCapsule);
      const updated = [saved, ...capsules.filter((c) => c.id !== saved.id)];
      saveState(updated);
      setIsWriteModalOpen(false);
      setTitle('');
      setContent('');
      setCustomDate('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save time capsule letter';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCapsule = async (id: string) => {
    if (!window.confirm('Delete this time capsule letter permanently?')) return;
    setApiError(null);
    try {
      await api.deleteTimeCapsule(id);
      const updated = capsules.filter((c) => c.id !== id);
      saveState(updated);
      if (selectedCapsule?.id === id) setSelectedCapsule(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete time capsule letter';
      setApiError(msg);
    }
  };

  const calculateDaysRemaining = (unlockDateStr: string) => {
    if (unlockDateStr <= todayStr) return 0;
    const [uy, um, ud] = unlockDateStr.split('-').map(Number);
    const [ty, tm, td] = todayStr.split('-').map(Number);
    if (!uy || !um || !ud || !ty || !tm || !td) return 0;
    const targetUtc = Date.UTC(uy, um - 1, ud);
    const todayUtc = Date.UTC(ty, tm - 1, td);
    const diffDays = Math.round((targetUtc - todayUtc) / 86400000);
    return Math.max(0, diffDays);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Mail className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">
              Time Capsule: Letters to Future Self
            </h2>
            <ThemeBadge tone="accent">Date-Restricted Reminders</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Write reflective letters to your future self. Content is date-restricted and sealed until your chosen unlock date arrives.
          </p>
        </div>

        <ThemeButton variant="primary" size="sm" onClick={() => setIsWriteModalOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Seal New Letter
        </ThemeButton>
      </div>

      {/* Error Banner */}
      {apiError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{apiError}</span>
          </div>
          <button
            onClick={loadCapsules}
            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition-colors flex items-center gap-1 text-[11px]"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* Genuine Empty State */}
      {capsules.length === 0 && !isLoading && (
        <div className="text-center py-12 px-4 rounded-2xl bg-[var(--ff-surface)] border border-dashed border-[var(--ff-border)] space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--ff-surface-muted)] flex items-center justify-center text-[var(--ff-text-muted)]">
            <Mail className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">No Sealed Letters Yet</h3>
            <p className="text-xs text-[var(--ff-text-muted)] max-w-sm mx-auto">
              Write a date-restricted personal reflection to your future self. It will remain locked until your selected unlock date arrives.
            </p>
          </div>
          <ThemeButton variant="primary" size="sm" onClick={() => setIsWriteModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Seal Your First Letter
          </ThemeButton>
        </div>
      )}

      {/* Capsules Grid */}
      {capsules.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {capsules.map((c) => {
            const daysLeft = calculateDaysRemaining(c.unlockDate);
            // Trust server-provided isUnlocked status
            const isUnlocked = Boolean(c.isUnlocked) || daysLeft === 0;

            return (
              <div
                key={c.id}
                className={`p-5 rounded-2xl bg-[var(--ff-surface)] border transition-all space-y-4 flex flex-col justify-between ${
                  isUnlocked
                    ? 'border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'border-[var(--ff-border)] hover:border-amber-500/40'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        isUnlocked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {isUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {isUnlocked ? 'Capsule Unlocked' : `Sealed: ${daysLeft} Days Left`}
                    </span>

                    <button
                      onClick={() => handleDeleteCapsule(c.id)}
                      className="p-1 text-[var(--ff-text-muted)] hover:text-rose-400 transition-colors"
                      title="Delete Capsule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)] line-clamp-2">{c.title}</h3>

                  <div className="text-[11px] text-[var(--ff-text-muted)] space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      <span>Sealed on: {c.createdAt ? c.createdAt.split('T')[0] : 'Recently'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      <span>Target Date: {c.unlockDate}</span>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <div className="pt-3 border-t border-[var(--ff-border)]">
                  {isUnlocked ? (
                    <ThemeButton
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={() => setSelectedCapsule(c)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Open Unlocked Letter
                    </ThemeButton>
                  ) : (
                    <div className="text-center py-1 text-xs text-[var(--ff-text-muted)] font-mono flex items-center justify-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Sealed until {c.unlockDate}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read Unlocked Capsule Modal */}
      {selectedCapsule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--ff-surface)] border border-emerald-500/40 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-[var(--ff-text-primary)]">{selectedCapsule.title}</h3>
                  <span className="text-[10px] text-[var(--ff-text-muted)]">
                    Written on {selectedCapsule.createdAt ? selectedCapsule.createdAt.split('T')[0] : 'Past Date'} • Unlocked on {selectedCapsule.unlockDate}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedCapsule(null)}
                className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-[#090d16] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)] font-serif leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
              {revealContent(selectedCapsule.content)}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--ff-border)]">
              <span className="text-xs text-[var(--ff-text-muted)] italic">
                “We never step into the same river twice, for other waters are ever flowing on.”
              </span>
              <ThemeButton variant="secondary" size="sm" onClick={() => setSelectedCapsule(null)}>
                Close Letter
              </ThemeButton>
            </div>
          </div>
        </div>
      )}

      {/* Write New Capsule Modal */}
      {isWriteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Seal Letter to Future Self</h3>

            <form onSubmit={handleCreateCapsule} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Letter Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. State of Mind at 22: Ambitions & Fears"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
                />
              </div>

              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Target Unlock Horizon</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: '6m', label: '6 Months' },
                    { id: '1y', label: '1 Year' },
                    { id: '3y', label: '3 Years' },
                    { id: 'custom', label: 'Custom' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setUnlockPreset(preset.id as typeof unlockPreset)}
                      className={`py-1.5 rounded-xl border text-[11px] font-medium transition-all ${
                        unlockPreset === preset.id
                          ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                          : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border)] text-[var(--ff-text-muted)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {unlockPreset === 'custom' && (
                <div>
                  <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Custom Unlock Date</label>
                  <input
                    type="date"
                    required
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    min={formatDateInTimezone(new Date(Date.now() + 86400000))}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
                  />
                </div>
              )}

              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">
                  Message to Your Future Self
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="What are your goals right now? What are you struggling with? What do you hope will be different when you open this?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border)]">
                <ThemeButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsWriteModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </ThemeButton>
                <ThemeButton type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? 'Sealing...' : 'Seal Capsule'}
                </ThemeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
