import React, { useState, useMemo, useEffect } from 'react';
import { DecisionEntry } from '../../types/features15.ts';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatDateInTimezone, getTodayDateString } from '../../lib/dateTime.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Scale,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Award,
  ChevronRight,
  TrendingUp,
  Brain,
  History,
} from 'lucide-react';


const SEED_DECISIONS: DecisionEntry[] = [
  {
    id: 'dec-1',
    userId: 'user',
    title: 'Switching to Semester-Long Micro-Project System',
    category: 'academic',
    rationale: 'Relying purely on cramming before midterms caused high stress and low retention.',
    expectedOutcome: 'Build 4 working portfolio projects, achieve > 8.5 GPA, and master systems programming.',
    confidenceScore: 8,
    expectedReviewDate: formatDateInTimezone(new Date(Date.now() + 60 * 86400000)),
    reviewIntervalDays: 90,
    status: 'pending_review',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'dec-2',
    userId: 'user',
    title: 'Automating Monthly Index Fund SIP on Salary Day',
    category: 'financial',
    rationale: 'Manual investing led to emotional timing and unspent discretionary leaks.',
    expectedOutcome: 'Zero friction wealth accumulation and 20% minimum savings rate achieved automatically.',
    confidenceScore: 9,
    expectedReviewDate: formatDateInTimezone(new Date(Date.now() - 5 * 86400000)), // Past review date
    reviewIntervalDays: 30,
    status: 'reviewed',
    actualOutcome: 'Transferred 25% of monthly income seamlessly for 3 months without lifestyle constraint.',
    lessonsLearned: 'Automating investments before seeing the bank balance eliminates Parkinson’s Law of spending.',
    createdAt: new Date(Date.now() - 35 * 86400000).toISOString(),
    reviewedAt: new Date().toISOString(),
  },
];

export const DecisionJournal: React.FC = () => {
  const { user } = useApp();
  const activeUid = user?.id || 'usr_guest';
  const storageKey = `focusflow_${activeUid}_decision_journal_v1`;

  const [decisions, setDecisions] = useState<DecisionEntry[]>(() => {
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

  // Sync with user-scoped storage & backend
  useEffect(() => {
    let isMounted = true;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setDecisions(parsed);
      } catch {}
    } else {
      setDecisions([]);
    }

    api.getDecisionEntries().then((remote) => {
      if (isMounted && Array.isArray(remote) && remote.length > 0) {
        setDecisions(remote);
        try {
          localStorage.setItem(storageKey, JSON.stringify(remote));
        } catch {}
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed' | 'all'>('pending');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [reviewModalEntry, setReviewModalEntry] = useState<DecisionEntry | null>(null);

  // New Decision Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DecisionEntry['category']>('career');
  const [rationale, setRationale] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [confidenceScore, setConfidenceScore] = useState(7);
  const [reviewDays, setReviewDays] = useState(30);

  // Review Reflection Form State
  const [actualOutcome, setActualOutcome] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');

  const saveState = (updated: DecisionEntry[]) => {
    setDecisions(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleCreateDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rationale.trim()) return;

    const reviewDate = formatDateInTimezone(new Date(Date.now() + reviewDays * 86400000));

    const newEntry: DecisionEntry = {
      id: `dec-${Date.now()}`,
      userId: activeUid,
      title: title.trim(),
      category,
      rationale: rationale.trim(),
      expectedOutcome: expectedOutcome.trim(),
      confidenceScore,
      expectedReviewDate: reviewDate,
      reviewIntervalDays: reviewDays,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
    };

    saveState([newEntry, ...decisions]);
    api.saveDecisionEntry(newEntry).catch(() => {});
    setIsAddModalOpen(false);
    setTitle('');
    setRationale('');
    setExpectedOutcome('');
  };

  const handleCompleteReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalEntry) return;

    let updatedEntry: DecisionEntry | null = null;
    const updated = decisions.map((d) => {
      if (d.id === reviewModalEntry.id) {
        updatedEntry = {
          ...d,
          status: 'reviewed' as const,
          actualOutcome: actualOutcome.trim(),
          lessonsLearned: lessonsLearned.trim(),
          reviewedAt: new Date().toISOString(),
        };
        return updatedEntry;
      }
      return d;
    });

    saveState(updated);
    if (updatedEntry) {
      api.saveDecisionEntry(updatedEntry).catch(() => {});
    }
    setReviewModalEntry(null);
    setActualOutcome('');
    setLessonsLearned('');
  };

  const filteredDecisions = useMemo(() => {
    if (activeTab === 'all') return decisions;
    return decisions.filter((d) => d.status === (activeTab === 'pending' ? 'pending_review' : 'reviewed'));
  }, [decisions, activeTab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Brain className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">Decision Journal & Cognitive Audits</h2>
            <ThemeBadge tone="accent">v1.8 Metacognition</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Record key strategic choices, expected outcomes, and review them after 30/90 days to defeat hindsight bias.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Filter */}
          <div className="flex rounded-xl bg-[var(--ff-surface-muted)] p-0.5 border border-[var(--ff-border)]">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                activeTab === 'pending'
                  ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              Pending Review ({decisions.filter((d) => d.status === 'pending_review').length})
            </button>
            <button
              onClick={() => setActiveTab('reviewed')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                activeTab === 'reviewed'
                  ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              Reviewed ({decisions.filter((d) => d.status === 'reviewed').length})
            </button>
          </div>

          <ThemeButton variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Log Decision
          </ThemeButton>
        </div>
      </div>

      {/* Decisions List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredDecisions.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-muted)]">
            No decisions logged under this filter. Record major architectural, academic, or financial decisions above.
          </div>
        ) : (
          filteredDecisions.map((entry) => {
            const isDue = new Date(entry.expectedReviewDate) <= new Date() && entry.status === 'pending_review';

            return (
              <div
                key={entry.id}
                className={`p-5 rounded-2xl bg-[var(--ff-surface)] border transition-all space-y-3 ${
                  isDue ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : 'border-[var(--ff-border)]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">{entry.title}</h3>
                    <ThemeBadge tone={isDue ? 'warning' : entry.status === 'reviewed' ? 'success' : 'accent'}>
                      {isDue ? 'Review Due Now' : entry.category.toUpperCase()}
                    </ThemeBadge>
                    <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                      Confidence: {entry.confidenceScore}/10
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[var(--ff-text-muted)]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Review Target: {entry.expectedReviewDate}</span>
                  </div>
                </div>

                {/* Rationale & Expected */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)]">
                      Decision Rationale
                    </span>
                    <p className="text-[var(--ff-text-primary)] leading-relaxed">{entry.rationale}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)]">
                      Anticipated Outcome
                    </span>
                    <p className="text-[var(--ff-text-primary)] leading-relaxed">{entry.expectedOutcome}</p>
                  </div>
                </div>

                {/* If already reviewed, display outcome reflection */}
                {entry.status === 'reviewed' && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Retrospective Reflection (Reviewed on {entry.reviewedAt?.split('T')[0]})</span>
                    </div>
                    {entry.actualOutcome && (
                      <div>
                        <strong className="text-emerald-300">Actual Result:</strong>{' '}
                        <span className="text-[var(--ff-text-primary)]">{entry.actualOutcome}</span>
                      </div>
                    )}
                    {entry.lessonsLearned && (
                      <div>
                        <strong className="text-emerald-300">Key Lessons:</strong>{' '}
                        <span className="text-[var(--ff-text-primary)]">{entry.lessonsLearned}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* If pending review, show trigger button */}
                {entry.status === 'pending_review' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border)]">
                    <ThemeButton
                      variant={isDue ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setReviewModalEntry(entry)}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      {isDue ? 'Perform Retrospective Review' : 'Early Review'}
                    </ThemeButton>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Log Decision Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">Log Strategic Decision</h3>

            <form onSubmit={handleCreateDecision} className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Decision Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reject offer X in favor of Y to pursue deep systems mastery"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Domain</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as DecisionEntry['category'])}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
                  >
                    <option value="career">Career / Work</option>
                    <option value="academic">Academic / Learning</option>
                    <option value="financial">Financial / Investment</option>
                    <option value="personal">Personal / Life</option>
                    <option value="health">Health & Energy</option>
                  </select>
                </div>

                <div>
                  <label className="font-medium text-[var(--ff-text-muted)] block mb-1">Review Horizon</label>
                  <select
                    value={reviewDays}
                    onChange={(e) => setReviewDays(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)]"
                  >
                    <option value={30}>30 Days (Tactical)</option>
                    <option value={60}>60 Days (Mid-Horizon)</option>
                    <option value={90}>90 Days (Quarterly Benchmark)</option>
                    <option value={180}>180 Days (Strategic Shift)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">
                  Why are you making this decision? (Current Rationale)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="What facts, assumptions, and constraints led to this decision right now?"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] resize-none"
                />
              </div>

              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">
                  What specific outcome do you expect to see by review date?
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Concrete measurable predictions"
                  value={expectedOutcome}
                  onChange={(e) => setExpectedOutcome(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] resize-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-medium text-[var(--ff-text-muted)]">Confidence Level</label>
                  <span className="font-bold text-[var(--ff-text-primary)] font-mono">{confidenceScore} / 10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={confidenceScore}
                  onChange={(e) => setConfidenceScore(parseInt(e.target.value, 10))}
                  className="w-full accent-[var(--ff-accent)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border)]">
                <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </ThemeButton>
                <ThemeButton type="submit" variant="primary" size="sm">
                  Record Decision
                </ThemeButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Perform Review Reflection Modal */}
      {reviewModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
              Retrospective Review: {reviewModalEntry.title}
            </h3>

            <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-xs space-y-1">
              <span className="text-[10px] font-bold text-[var(--ff-text-muted)] uppercase">Expected Outcome Was:</span>
              <p className="text-[var(--ff-text-primary)]">{reviewModalEntry.expectedOutcome}</p>
            </div>

            <form onSubmit={handleCompleteReview} className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">
                  What actually happened in reality?
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Record what actually transpired without hindsight rationalization..."
                  value={actualOutcome}
                  onChange={(e) => setActualOutcome(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] resize-none"
                />
              </div>

              <div>
                <label className="font-medium text-[var(--ff-text-muted)] block mb-1">
                  What key lessons or cognitive biases did you observe?
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Underestimated friction, optimism bias, or verified hypothesis..."
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border)]">
                <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setReviewModalEntry(null)}>
                  Cancel
                </ThemeButton>
                <ThemeButton type="submit" variant="primary" size="sm">
                  Save Retrospective
                </ThemeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

