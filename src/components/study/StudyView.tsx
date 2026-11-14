import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import {
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyMistake,
  RevisionDifficulty,
} from '../../types/study.ts';
import { Habit, FocusSession } from '../../types/index.ts';
import { DEFAULT_ACADEMIC_TIERS, buildDefaultStudyWorkspace } from '../../data/studySeedData.ts';
import {
  categorizeRevisions,
  computeStudyProgressSummary,
} from '../../lib/studyIntelligence.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { motion } from 'motion/react';
import { AddStudySubjectModal } from './AddStudySubjectModal.tsx';
import { AddStudyTopicModal } from './AddStudyTopicModal.tsx';
import { ScheduleRevisionModal } from './ScheduleRevisionModal.tsx';
import { LogStudyMistakeModal } from './LogStudyMistakeModal.tsx';
import {
  GraduationCap,
  BookOpen,
  RotateCcw,
  AlertTriangle,
  Flame,
  TrendingUp,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  Trash2,
  Check,
  CheckSquare,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

type StudySubTab = 'syllabus' | 'revisions' | 'mistakes' | 'habits' | 'analytics';

export const StudyView: React.FC = () => {
  const { user, habits, refreshKey, triggerRefresh, showToast, setCurrentTab } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<StudySubTab>('syllabus');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mistakeSeverityFilter, setMistakeSeverityFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');

  // Live state
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [topics, setTopics] = useState<StudyTopic[]>([]);
  const [revisions, setRevisions] = useState<StudyRevision[]>([]);
  const [mistakes, setMistakes] = useState<StudyMistake[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [isAddTopicOpen, setIsAddTopicOpen] = useState(false);
  const [isScheduleRevisionOpen, setIsScheduleRevisionOpen] = useState(false);
  const [isLogMistakeOpen, setIsLogMistakeOpen] = useState(false);
  const [activeTopicForRevision, setActiveTopicForRevision] = useState<StudyTopic | null>(null);
  const isSeedingRef = useRef(false);

  // Load study entities
  const loadData = async () => {
    setLoading(true);
    try {
      const [subs, tops, revs, mists, sess] = await Promise.all([
        api.getStudySubjects().catch(() => [] as StudySubject[]),
        api.getStudyTopics().catch(() => [] as StudyTopic[]),
        api.getStudyRevisions().catch(() => [] as StudyRevision[]),
        api.getStudyMistakes().catch(() => [] as StudyMistake[]),
        api.getFocusSessions().catch(() => [] as FocusSession[]),
      ]);

      setFocusSessions(sess);

      if (subs.length === 0) {
        if (!isSeedingRef.current) {
          isSeedingRef.current = true;
          // Auto-seed initial syllabus for user
          const seed = buildDefaultStudyWorkspace(user?.id || 'guest');
          setSubjects(seed.subjects);
          setTopics(seed.topics);
          setRevisions(seed.revisions);
          setMistakes(seed.mistakes);

          // Background persist seed data
          Promise.all([
            ...seed.subjects.map((s) => api.saveStudySubject(s)),
            ...seed.topics.map((t) => api.saveStudyTopic(t)),
            ...seed.revisions.map((r) => api.saveStudyRevision(r)),
            ...seed.mistakes.map((m) => api.saveStudyMistake(m)),
          ])
            .catch((err) => console.error('Error auto-seeding study records:', err))
            .finally(() => {
              isSeedingRef.current = false;
            });
        }
      } else if (tops.length === 0) {
        // Subjects exist, but topics are empty (partial data state)
        // Recover topics idempotently from default syllabus without duplicating subjects
        setSubjects(subs);
        setRevisions(revs);
        setMistakes(mists);

        if (!isSeedingRef.current) {
          isSeedingRef.current = true;
          const seed = buildDefaultStudyWorkspace(user?.id || 'guest');
          const existingCodes = new Set(subs.map((s) => s.code));
          const relevantTopics = seed.topics.filter((t) => existingCodes.has(t.subjectCode));
          const recoveredTopics = relevantTopics.length > 0 ? relevantTopics : seed.topics;

          setTopics(recoveredTopics);
          Promise.all(recoveredTopics.map((t) => api.saveStudyTopic(t)))
            .catch((err) => console.error('Error auto-seeding missing topics:', err))
            .finally(() => {
              isSeedingRef.current = false;
            });
        }
      } else {
        setSubjects(subs);
        setTopics(tops);
        setRevisions(revs);
        setMistakes(mists);
      }
    } catch (err) {
      console.error('Failed to load study data:', err);
      showToast('Error loading study data. Running offline fallback.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, refreshKey]);

  // Derived calculations
  const progressSummary = useMemo(() => {
    return computeStudyProgressSummary({
      subjects,
      topics,
      revisions,
      mistakes,
      focusSessions,
    });
  }, [subjects, topics, revisions, mistakes, focusSessions]);

  const categorizedRevs = useMemo(() => {
    return categorizeRevisions(revisions);
  }, [revisions]);

  // Filtered subjects by tier
  const visibleSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (s.deletedAt) return false;
      if (selectedTier === 'all') return true;
      return s.tierId === selectedTier;
    });
  }, [subjects, selectedTier]);

  // Filtered topics by subject and search query
  const visibleTopics = useMemo(() => {
    return topics.filter((t) => {
      if (t.deletedAt) return false;
      if (selectedSubjectCode !== 'all' && t.subjectCode !== selectedSubjectCode) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesUnit = t.unit.toLowerCase().includes(q);
        const matchesTopic = t.topic.toLowerCase().includes(q);
        const matchesSubtopic = t.subtopic.toLowerCase().includes(q);
        const matchesNotes = t.notes?.toLowerCase().includes(q);
        if (!matchesUnit && !matchesTopic && !matchesSubtopic && !matchesNotes) return false;
      }
      return true;
    });
  }, [topics, selectedSubjectCode, searchQuery]);

  // Filtered mistakes
  const visibleMistakes = useMemo(() => {
    return mistakes.filter((m) => {
      if (m.deletedAt) return false;
      if (selectedSubjectCode !== 'all' && m.subjectCode !== selectedSubjectCode) return false;
      if (mistakeSeverityFilter !== 'All' && m.severity !== mistakeSeverityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTrap = m.trap.toLowerCase().includes(q);
        const matchesRoot = m.rootCause.toLowerCase().includes(q);
        const matchesRule = m.goldenRule.toLowerCase().includes(q);
        const matchesTopic = m.topic.toLowerCase().includes(q);
        if (!matchesTrap && !matchesRoot && !matchesRule && !matchesTopic) return false;
      }
      return true;
    });
  }, [mistakes, selectedSubjectCode, mistakeSeverityFilter, searchQuery]);

  // Academic Habits (filtered from FocusFlow habits)
  const studyHabits = useMemo(() => {
    const academicKeywords = ['study', 'code', 'dsa', 'gate', 'book', 'read', 'math', 'exam', 'paper', 'learn', 'revision', 'lecture'];
    return (habits || []).filter((h) => {
      const name = h.title.toLowerCase();
      const cat = (h.category || '').toLowerCase();
      return academicKeywords.some((k) => name.includes(k) || cat.includes(k));
    });
  }, [habits]);

  // Topic Checkbox Handlers
  const handleToggleTopicFlag = async (topicId: string, flag: 'theory' | 'practice' | 'pyq') => {
    const existing = topics.find((t) => t.id === topicId);
    if (!existing) return;

    const updated: StudyTopic = {
      ...existing,
      [flag]: !existing[flag],
      updatedAt: new Date().toISOString(),
    };

    // Optimistic state
    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));

    try {
      await api.saveStudyTopic(updated);
      showToast(`Updated ${flag.toUpperCase()} for "${existing.subtopic}"`, 'success');
    } catch (err) {
      console.error('Failed to update topic status:', err);
      showToast('Could not save progress', 'error');
      // Rollback
      setTopics((prev) => prev.map((t) => (t.id === topicId ? existing : t)));
    }
  };

  // Revision recall feedback handler
  const handleRecallFeedback = async (revisionId: string, difficulty: RevisionDifficulty) => {
    try {
      const updated = await api.recordStudyRecall(revisionId, difficulty);
      if (updated) {
        setRevisions((prev) => prev.map((r) => (r.id === revisionId ? updated : r)));
      } else {
        await loadData();
      }
      showToast(
        difficulty === 'easy'
          ? '🌟 Mastered recall! Interval extended.'
          : difficulty === 'medium'
          ? '👍 Good recall! Scheduled next interval.'
          : '🔄 Needs reinforcement! Scheduled for review.',
        'success'
      );
    } catch (err) {
      console.error('Failed to record recall:', err);
      showToast('Failed to record revision recall', 'error');
    }
  };

  // Toggle mistake resolved
  const handleToggleMistakeResolved = async (mistake: StudyMistake) => {
    const updated: StudyMistake = {
      ...mistake,
      resolved: !mistake.resolved,
      updatedAt: new Date().toISOString(),
    };
    setMistakes((prev) => prev.map((m) => (m.id === mistake.id ? updated : m)));
    try {
      await api.saveStudyMistake(updated);
      showToast(
        updated.resolved ? 'Mistake marked as resolved!' : 'Mistake reopened',
        'info'
      );
    } catch (err) {
      console.error('Failed to update mistake:', err);
      setMistakes((prev) => prev.map((m) => (m.id === mistake.id ? mistake : m)));
    }
  };

  // Toggle habit check-off
  const handleToggleHabit = async (habitId: string, dateStr: string) => {
    try {
      await api.toggleHabit(habitId, dateStr);
      triggerRefresh();
    } catch (err) {
      console.error('Failed to toggle habit:', err);
    }
  };

  // Delete handlers
  const handleDeleteTopic = async (topicId: string) => {
    if (!window.confirm('Delete this topic from syllabus?')) return;
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
    try {
      await api.deleteStudyTopic(topicId);
      showToast('Topic removed', 'info');
    } catch (err) {
      console.error('Failed to delete topic:', err);
    }
  };

  const handleDeleteRevision = async (revId: string) => {
    if (!window.confirm('Remove this spaced revision schedule?')) return;
    setRevisions((prev) => prev.filter((r) => r.id !== revId));
    try {
      await api.deleteStudyRevision(revId);
      showToast('Revision removed', 'info');
    } catch (err) {
      console.error('Failed to delete revision:', err);
    }
  };

  const handleDeleteMistake = async (mistakeId: string) => {
    if (!window.confirm('Delete this mistake entry?')) return;
    setMistakes((prev) => prev.filter((m) => m.id !== mistakeId));
    try {
      await api.deleteStudyMistake(mistakeId);
      showToast('Mistake removed', 'info');
    } catch (err) {
      console.error('Failed to delete mistake:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header with Academic Branding and Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--ff-text-primary)]">
                Study OS
              </h1>
              <ThemeBadge tone="accent">
                Academic Intelligence
              </ThemeBadge>
            </div>
            <p className="text-xs sm:text-sm text-[var(--ff-text-muted)] mt-0.5">
              Syllabus tracking, Ebbinghaus spaced repetitions, and mistake root-cause diagnostics
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => setIsLogMistakeOpen(true)}
            className="text-rose-400 hover:bg-rose-500/10"
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Log Mistake
          </ThemeButton>

          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setActiveTopicForRevision(null);
              setIsScheduleRevisionOpen(true);
            }}
            className="text-amber-400 hover:bg-amber-500/10"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Schedule Revision
          </ThemeButton>

          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => setIsAddTopicOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Topic
          </ThemeButton>

          <ThemeButton
            variant="primary"
            size="sm"
            onClick={() => setIsAddSubjectOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Subject
          </ThemeButton>
        </div>
      </div>

      {/* Top Academic Pulse KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <ThemeCard className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
            <span className="font-medium">Syllabus Completion</span>
            <BookOpen className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--ff-text-primary)]">
              {progressSummary.overallCompletionPct}%
            </span>
            <span className="text-xs text-[var(--ff-text-muted)]">
              {progressSummary.completedTopics}/{progressSummary.totalTopics} topics
            </span>
          </div>
          <div className="w-full bg-[var(--ff-surface-muted)] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressSummary.overallCompletionPct}%` }}
            />
          </div>
        </ThemeCard>

        <ThemeCard className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
            <span className="font-medium">Due & Overdue Revisions</span>
            <RotateCcw className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--ff-text-primary)]">
              {progressSummary.dueRevisionsCount}
            </span>
            {progressSummary.overdueRevisionsCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400">
                {progressSummary.overdueRevisionsCount} overdue
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)] mt-2">
            {progressSummary.masteredRevisionsCount} topics mastered in long-term memory
          </p>
        </ThemeCard>

        <ThemeCard className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
            <span className="font-medium">High Severity Traps</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400">
              {progressSummary.highSeverityMistakesCount}
            </span>
            <span className="text-xs text-[var(--ff-text-muted)]">
              of {progressSummary.unresolvedMistakesCount} unresolved
            </span>
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)] mt-2">
            Review Golden Rules before your next exam
          </p>
        </ThemeCard>

        <ThemeCard className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
            <span className="font-medium">Deep Study Time</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--ff-text-primary)]">
              {Math.round((progressSummary.totalStudyMinutes / 60) * 10) / 10}h
            </span>
            <span className="text-xs text-[var(--ff-text-muted)]">logged in focus</span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1 text-[11px]">
            <button
              onClick={() => setCurrentTab('focus')}
              className="text-[var(--ff-accent-text)] hover:underline flex items-center gap-1"
            >
              Start Focus Session <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </ThemeCard>
      </div>

      {/* Sub-tab Navigation Bar */}
      <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-2 overflow-x-auto">
        <div className="flex items-center gap-1 sm:gap-2">
          {(
            [
              { id: 'syllabus', label: 'Syllabus & Topics', icon: BookOpen },
              {
                id: 'revisions',
                label: 'Spaced Repetition',
                icon: RotateCcw,
                badge: progressSummary.dueRevisionsCount > 0 ? progressSummary.dueRevisionsCount : undefined,
              },
              {
                id: 'mistakes',
                label: 'Mistake Log',
                icon: AlertTriangle,
                badge: progressSummary.unresolvedMistakesCount > 0 ? progressSummary.unresolvedMistakesCount : undefined,
              },
              { id: 'habits', label: 'Academic Habits', icon: CheckSquare },
              { id: 'analytics', label: 'Analytics & Mastery', icon: TrendingUp },
            ] as Array<{
              id: StudySubTab;
              label: string;
              icon: React.ComponentType<{ className?: string }>;
              badge?: number;
            }>
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`relative px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? 'text-[var(--ff-text-primary)] bg-[var(--ff-surface-muted)] shadow-sm'
                    : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--ff-accent-text)]' : ''}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500/20 text-rose-400 font-bold">
                    {tab.badge}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="study-subtab-indicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--ff-accent)] rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pl-4">
          <ThemeButton variant="ghost" size="sm" onClick={loadData} title="Refresh data">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </ThemeButton>
        </div>
      </div>

      {/* SUB-VIEW 1: SYLLABUS & TOPICS */}
      {activeSubTab === 'syllabus' && (
        <div className="space-y-6">
          {/* Filters: Academic Tier + Subject Select + Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Academic Tiers */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              <button
                onClick={() => {
                  setSelectedTier('all');
                  setSelectedSubjectCode('all');
                }}
                className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all whitespace-nowrap border ${
                  selectedTier === 'all'
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] shadow-sm'
                    : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                All Tiers
              </button>
              {DEFAULT_ACADEMIC_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => {
                    setSelectedTier(tier.id);
                    setSelectedSubjectCode('all');
                  }}
                  className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all whitespace-nowrap border ${
                    selectedTier === tier.id
                      ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] shadow-sm'
                      : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  {tier.shortTitle || tier.name}
                </button>
              ))}
            </div>

            {/* Subject Dropdown & Search */}
            <div className="flex items-center gap-2">
              <select
                value={selectedSubjectCode}
                onChange={(e) => setSelectedSubjectCode(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
              >
                <option value="all">All Subjects ({visibleSubjects.length})</option>
                {visibleSubjects.map((sub) => (
                  <option key={sub.code} value={sub.code}>
                    {sub.name} ({sub.code})
                  </option>
                ))}
              </select>

              <div className="relative flex-1 md:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter topics..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Subject Overview Cards Carousel / Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {visibleSubjects.map((sub) => {
              const subTopics = topics.filter((t) => t.subjectCode === sub.code && !t.deletedAt);
              const completed = subTopics.filter((t) => t.theory && t.practice).length;
              const pct = subTopics.length > 0 ? Math.round((completed / subTopics.length) * 100) : 0;
              const isSelected = selectedSubjectCode === sub.code;

              return (
                <div
                  key={sub.code}
                  onClick={() => setSelectedSubjectCode(isSelected ? 'all' : sub.code)}
                  className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-[var(--ff-surface-muted)] border-[var(--ff-accent)] ring-1 ring-[var(--ff-accent)]'
                      : 'bg-[var(--ff-surface-card)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: sub.color || '#6366f1' }}
                    />
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                      {sub.code}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-[var(--ff-text-primary)] truncate" title={sub.name}>
                    {sub.name}
                  </h3>
                  <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">
                    {sub.targetExam || sub.semesterOrDomain || 'Core Subject'}
                  </p>

                  <div className="mt-3 pt-2 border-t border-[var(--ff-border-color)]/60 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--ff-text-muted)]">{pct}% done</span>
                    <span className="font-medium text-[var(--ff-text-primary)]">
                      {completed}/{subTopics.length}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--ff-surface-muted)] h-1 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: sub.color || '#6366f1',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Topic Checklist Table */}
          <ThemeCard className="overflow-hidden">
            <div className="p-4 border-b border-[var(--ff-border-color)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <h2 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                  Syllabus Checklist ({visibleTopics.length} items)
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--ff-text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-blue-500"></span> [T] Theory
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-emerald-500"></span> [P] Practice
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-purple-500"></span> [Q] PYQ
                </span>
              </div>
            </div>

            {visibleTopics.length === 0 ? (
              <div className="p-12 text-center text-xs text-[var(--ff-text-muted)]">
                No syllabus topics matching current filters.
              </div>
            ) : (
              <div className="divide-y divide-[var(--ff-border-color)]">
                {visibleTopics.map((item) => {
                  const sub = subjects.find((s) => s.code === item.subjectCode);
                  const isFullyCompleted = item.theory && item.practice;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--ff-surface-muted)]/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded font-mono font-medium text-white shadow-sm"
                            style={{ backgroundColor: sub?.color || '#6366f1' }}
                          >
                            {item.subjectCode}
                          </span>
                          <span className="text-[11px] font-medium text-[var(--ff-text-muted)]">
                            {item.unit}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              item.priority === 'High'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : item.priority === 'Medium'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {item.priority}
                          </span>
                          {isFullyCompleted && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 flex items-center gap-1 font-medium">
                              <Check className="w-3 h-3" /> Mastered
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-medium text-[var(--ff-text-primary)] leading-tight">
                          {item.subtopic || item.topic}
                        </h4>
                        {item.topic && item.subtopic && (
                          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                            Unit Scope: {item.topic}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-[var(--ff-text-muted)]/80 italic mt-1 bg-[var(--ff-surface-muted)] px-2.5 py-1 rounded-lg border border-[var(--ff-border-color)] inline-block">
                            💡 {item.notes}
                          </p>
                        )}
                      </div>

                      {/* Interactive T / P / Q Checkbox Pills & Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <div className="flex items-center gap-1.5 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border-color)]">
                          <button
                            type="button"
                            onClick={() => handleToggleTopicFlag(item.id, 'theory')}
                            title="Theory: Concept understood"
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                              item.theory
                                ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                            }`}
                          >
                            T
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleTopicFlag(item.id, 'practice')}
                            title="Practice: Solved problems / implemented"
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                              item.practice
                                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                            }`}
                          >
                            P
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleTopicFlag(item.id, 'pyq')}
                            title="PYQ: Previous Year Questions solved"
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                              item.pyq
                                ? 'bg-purple-500 text-white shadow-sm shadow-purple-500/30'
                                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                            }`}
                          >
                            Q
                          </button>
                        </div>

                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveTopicForRevision(item);
                            setIsScheduleRevisionOpen(true);
                          }}
                          className="h-8 px-2 text-amber-400 hover:bg-amber-500/10"
                          title="Schedule Spaced Revision"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </ThemeButton>

                        <button
                          type="button"
                          onClick={() => handleDeleteTopic(item.id)}
                          className="p-1.5 text-[var(--ff-text-muted)] hover:text-rose-400 transition-colors"
                          title="Delete Topic"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ThemeCard>
        </div>
      )}

      {/* SUB-VIEW 2: SPACED REPETITION (EBBINGHAUS) */}
      {activeSubTab === 'revisions' && (
        <div className="space-y-6">
          {/* Overdue Section */}
          {categorizedRevs.overdue.length > 0 && (
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Overdue Revisions ({categorizedRevs.overdue.length})</span>
                </div>
                <span className="text-xs text-rose-300">Memory retention at risk</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categorizedRevs.overdue.map((rev) => (
                  <ThemeCard key={rev.id} className="p-4 border-rose-500/40 bg-[var(--ff-surface-card)]">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                          {rev.subjectCode}
                        </span>
                        <h4 className="text-sm font-semibold text-[var(--ff-text-primary)] mt-1">
                          {rev.topicTitle}
                        </h4>
                      </div>
                      <span className="text-xs text-rose-400 font-medium whitespace-nowrap">
                        Due: {rev.nextRevisionAt}
                      </span>
                    </div>

                    {rev.notes && (
                      <p className="text-xs text-[var(--ff-text-muted)] mb-3 bg-[var(--ff-surface-muted)] p-2 rounded-lg">
                        {rev.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--ff-border-color)]">
                      <span className="text-[11px] text-[var(--ff-text-muted)]">
                        Interval: {rev.intervalDays}d (Rep #{rev.repetition})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecallFeedback(rev.id, 'hard')}
                          className="text-xs py-1 px-2.5 text-rose-400 hover:bg-rose-500/10"
                        >
                          Hard
                        </ThemeButton>
                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecallFeedback(rev.id, 'medium')}
                          className="text-xs py-1 px-2.5 text-amber-400 hover:bg-amber-500/10"
                        >
                          Medium
                        </ThemeButton>
                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecallFeedback(rev.id, 'easy')}
                          className="text-xs py-1 px-2.5 text-emerald-400 hover:bg-emerald-500/10"
                        >
                          Easy
                        </ThemeButton>
                      </div>
                    </div>
                  </ThemeCard>
                ))}
              </div>
            </div>
          )}

          {/* Due Today Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Due Today ({categorizedRevs.dueToday.length})
              </h3>
              <span className="text-xs text-[var(--ff-text-muted)]">
                Interval: 1d → 3d → 7d → 14d → 30d → 60d
              </span>
            </div>

            {categorizedRevs.dueToday.length === 0 ? (
              <ThemeCard className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
                🎉 No revisions due today! All active memory items are refreshed.
              </ThemeCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categorizedRevs.dueToday.map((rev) => (
                  <ThemeCard key={rev.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                          {rev.subjectCode}
                        </span>
                        <h4 className="text-sm font-semibold text-[var(--ff-text-primary)] mt-1">
                          {rev.topicTitle}
                        </h4>
                      </div>
                      <span className="text-xs text-amber-400 font-medium">Due Today</span>
                    </div>

                    {rev.notes && (
                      <p className="text-xs text-[var(--ff-text-muted)] mb-3 bg-[var(--ff-surface-muted)] p-2 rounded-lg">
                        {rev.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--ff-border-color)]">
                      <span className="text-[11px] text-[var(--ff-text-muted)]">
                        Interval: {rev.intervalDays}d (Rep #{rev.repetition})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecallFeedback(rev.id, 'hard')}
                          className="text-xs py-1 px-2.5 text-rose-400 hover:bg-rose-500/10"
                        >
                          Hard
                        </ThemeButton>
                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecallFeedback(rev.id, 'medium')}
                          className="text-xs py-1 px-2.5 text-amber-400 hover:bg-amber-500/10"
                        >
                          Medium
                        </ThemeButton>
                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecallFeedback(rev.id, 'easy')}
                          className="text-xs py-1 px-2.5 text-emerald-400 hover:bg-emerald-500/10"
                        >
                          Easy
                        </ThemeButton>
                        <button
                          onClick={() => handleDeleteRevision(rev.id)}
                          className="p-1 text-[var(--ff-text-muted)] hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </ThemeCard>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--ff-text-primary)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Upcoming Scheduled Revisions ({categorizedRevs.upcoming.length})
            </h3>

            {categorizedRevs.upcoming.length === 0 ? (
              <p className="text-xs text-[var(--ff-text-muted)]">No upcoming revisions scheduled yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {categorizedRevs.upcoming.slice(0, 9).map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-mono text-[var(--ff-accent-text)] font-semibold">{rev.subjectCode}</span>
                        <span className="text-[var(--ff-text-muted)]">{rev.nextRevisionAt}</span>
                      </div>
                      <h4 className="text-xs font-medium text-[var(--ff-text-primary)] line-clamp-2">
                        {rev.topicTitle}
                      </h4>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--ff-text-muted)] mt-2 pt-2 border-t border-[var(--ff-border-color)]">
                      <span>Interval: {rev.intervalDays} days</span>
                      <button
                        onClick={() => handleDeleteRevision(rev.id)}
                        className="text-[var(--ff-text-muted)] hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mastered Section */}
          {categorizedRevs.mastered.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Mastered Topics in Long-Term Memory ({categorizedRevs.mastered.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {categorizedRevs.mastered.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">{rev.subjectCode}</span>
                      <h4 className="text-xs font-medium text-[var(--ff-text-primary)] truncate max-w-[200px]">
                        {rev.topicTitle}
                      </h4>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 3: MISTAKE LOG (3-TIER ERROR NOTEBOOK) */}
      {activeSubTab === 'mistakes' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {(['All', 'High', 'Medium', 'Low'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setMistakeSeverityFilter(sev)}
                  className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all ${
                    mistakeSeverityFilter === sev
                      ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                      : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border border-[var(--ff-border-color)]'
                  }`}
                >
                  {sev} Severity
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedSubjectCode}
                onChange={(e) => setSelectedSubjectCode(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
              >
                <option value="all">All Subjects</option>
                {subjects.map((sub) => (
                  <option key={sub.code} value={sub.code}>
                    {sub.name}
                  </option>
                ))}
              </select>

              <ThemeButton
                variant="primary"
                size="sm"
                onClick={() => setIsLogMistakeOpen(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Log Mistake
              </ThemeButton>
            </div>
          </div>

          {/* Mistake Cards */}
          {visibleMistakes.length === 0 ? (
            <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)]">
              No mistakes found matching criteria. Keep logging every trap you encounter to build mental immunity!
            </ThemeCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleMistakes.map((m) => (
                <ThemeCard
                  key={m.id}
                  className={`p-4 sm:p-5 flex flex-col justify-between transition-all ${
                    m.resolved
                      ? 'opacity-70 border-dashed border-[var(--ff-border-color)]'
                      : m.severity === 'High'
                      ? 'border-rose-500/40'
                      : 'border-[var(--ff-border-color)]'
                  }`}
                >
                  <div>
                    {/* Header: Subject, Date, Severity, Resolved Toggle */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-[var(--ff-surface-muted)] text-[var(--ff-text-primary)]">
                          {m.subjectCode}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            m.severity === 'High'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : m.severity === 'Medium'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {m.severity}
                        </span>
                        {m.source && (
                          <span className="text-[10px] text-[var(--ff-text-muted)]">
                            {m.source}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--ff-text-muted)]">{m.date}</span>
                        <button
                          onClick={() => handleToggleMistakeResolved(m)}
                          className={`text-xs px-2 py-0.5 rounded-lg border font-medium transition-colors ${
                            m.resolved
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)] hover:text-emerald-400'
                          }`}
                        >
                          {m.resolved ? '✓ Resolved' : 'Mark Fixed'}
                        </button>
                      </div>
                    </div>

                    <h4 className="text-sm font-semibold text-[var(--ff-text-primary)] mb-3">
                      {m.topic}
                    </h4>

                    {/* 3-Tier Analysis */}
                    <div className="space-y-2.5 text-xs">
                      {/* 1. The Trap */}
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <div className="font-semibold text-rose-400 flex items-center gap-1.5 mb-1">
                          <span>❌ The Trap</span>
                        </div>
                        <p className="text-[var(--ff-text-primary)] leading-relaxed">
                          {m.trap}
                        </p>
                      </div>

                      {/* 2. Root Cause */}
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                          <span>🔍 Root Cause</span>
                        </div>
                        <p className="text-[var(--ff-text-primary)] leading-relaxed">
                          {m.rootCause}
                        </p>
                      </div>

                      {/* 3. Golden Rule */}
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="font-semibold text-emerald-400 flex items-center gap-1.5 mb-1">
                          <span>💡 Permanent Golden Rule</span>
                        </div>
                        <p className="text-[var(--ff-text-primary)] font-medium leading-relaxed">
                          {m.goldenRule}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-3 mt-3 border-t border-[var(--ff-border-color)]">
                    <button
                      onClick={() => handleDeleteMistake(m.id)}
                      className="text-xs text-[var(--ff-text-muted)] hover:text-rose-400 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Entry
                    </button>
                  </div>
                </ThemeCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 4: STUDY & CODING HABITS */}
      {activeSubTab === 'habits' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--ff-text-primary)] flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-[var(--ff-accent-text)]" />
                Academic & Problem Solving Habits
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)] mt-1">
                Synced with FocusFlow Habit Tracker. Consistency builds mastery.
              </p>
            </div>
            <ThemeButton
              variant="primary"
              size="sm"
              onClick={() => setCurrentTab('habits')}
            >
              Open Full Habit Tracker
            </ThemeButton>
          </div>

          {studyHabits.length === 0 ? (
            <ThemeCard className="p-8 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
              <p>No study-specific habits detected in your habit list.</p>
              <p>Tip: Add habits like "Solve 2 LeetCode / DSA Problems" or "Read 1 GATE Unit" in Habit Tracker.</p>
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => setCurrentTab('habits')}
              >
                Go to Habits & Add One
              </ThemeButton>
            </ThemeCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {studyHabits.map((habit) => {
                const todayStr = new Date().toISOString().slice(0, 10);
                const isCompletedToday = (habit.completedDates || []).includes(todayStr);

                return (
                  <ThemeCard key={habit.id} className="p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
                          {habit.category || 'Academic'}
                        </span>
                        <div className="flex items-center gap-1 text-amber-400 text-xs font-bold">
                          <Flame className="w-3.5 h-3.5" />
                          <span>{habit.bestStreakDays || 0}d best</span>
                        </div>
                      </div>

                      <h4 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                        {habit.title}
                      </h4>
                      {habit.description && (
                        <p className="text-xs text-[var(--ff-text-muted)] mt-1 line-clamp-2">
                          {habit.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--ff-border-color)]">
                      <span className="text-[11px] text-[var(--ff-text-muted)] capitalize">
                        {habit.frequency || 'Daily'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleHabit(habit.id, todayStr)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          isCompletedToday
                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
                            : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)]'
                        }`}
                      >
                        {isCompletedToday ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Done Today
                          </>
                        ) : (
                          <>
                            <Circle className="w-3.5 h-3.5" /> Mark Done
                          </>
                        )}
                      </button>
                    </div>
                  </ThemeCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 5: STUDY ANALYTICS */}
      {activeSubTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ThemeCard className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                Component Breakdown
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                    <span>Theory Covered</span>
                    <span className="font-semibold text-blue-400">
                      {progressSummary.theoryCompleted}/{progressSummary.totalTopics}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--ff-surface-muted)] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full"
                      style={{
                        width: `${
                          progressSummary.totalTopics > 0
                            ? Math.round((progressSummary.theoryCompleted / progressSummary.totalTopics) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                    <span>Practice Problems</span>
                    <span className="font-semibold text-emerald-400">
                      {progressSummary.practiceCompleted}/{progressSummary.totalTopics}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--ff-surface-muted)] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{
                        width: `${
                          progressSummary.totalTopics > 0
                            ? Math.round((progressSummary.practiceCompleted / progressSummary.totalTopics) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                    <span>PYQs Solved</span>
                    <span className="font-semibold text-purple-400">
                      {progressSummary.pyqCompleted}/{progressSummary.totalTopics}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--ff-surface-muted)] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full"
                      style={{
                        width: `${
                          progressSummary.totalTopics > 0
                            ? Math.round((progressSummary.pyqCompleted / progressSummary.totalTopics) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </ThemeCard>

            <ThemeCard className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                Memory Retention Status
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <span>Mastered (Long-term)</span>
                  <span className="font-bold">{progressSummary.masteredRevisionsCount}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <span>Due for Review</span>
                  <span className="font-bold">{progressSummary.dueRevisionsCount}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-500/10 text-rose-400">
                  <span>Overdue (Retention Risk)</span>
                  <span className="font-bold">{progressSummary.overdueRevisionsCount}</span>
                </div>
              </div>
            </ThemeCard>

            <ThemeCard className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                Mistake Diagnostics
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-500/10 text-rose-400">
                  <span>High Severity Flaws</span>
                  <span className="font-bold">{progressSummary.highSeverityMistakesCount}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                  <span>Unresolved Flaws</span>
                  <span className="font-bold">{progressSummary.unresolvedMistakesCount}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <span>Resolved & Mastered</span>
                  <span className="font-bold">
                    {mistakes.filter((m) => m.resolved && !m.deletedAt).length}
                  </span>
                </div>
              </div>
            </ThemeCard>
          </div>
        </div>
      )}

      {/* MODALS */}
      <AddStudySubjectModal
        isOpen={isAddSubjectOpen}
        onClose={() => setIsAddSubjectOpen(false)}
        onAdd={async (subjectData) => {
          const newSub: StudySubject = {
            id: `sub_${Date.now()}`,
            userId: user?.id || 'guest',
            code: subjectData.code!,
            name: subjectData.name!,
            tierId: subjectData.tierId || 'tier1_sem3',
            semesterOrDomain: subjectData.semesterOrDomain,
            targetExam: subjectData.targetExam,
            color: subjectData.color || '#6366f1',
            totalSubtopics: 0,
            completedSubtopics: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await api.saveStudySubject(newSub);
          setSubjects((prev) => [...prev, newSub]);
          showToast(`Subject ${newSub.name} added!`, 'success');
        }}
      />

      <AddStudyTopicModal
        isOpen={isAddTopicOpen}
        onClose={() => setIsAddTopicOpen(false)}
        subjects={subjects}
        defaultSubjectCode={selectedSubjectCode !== 'all' ? selectedSubjectCode : undefined}
        onAdd={async (topicData) => {
          const newTopic: StudyTopic = {
            id: `topic_${Date.now()}`,
            userId: user?.id || 'guest',
            subjectCode: topicData.subjectCode!,
            unit: topicData.unit || 'Unit 1',
            topic: topicData.topic || 'Core Concept',
            subtopic: topicData.subtopic || '',
            priority: topicData.priority || 'High',
            theory: topicData.theory || false,
            practice: topicData.practice || false,
            pyq: topicData.pyq || false,
            revisionCount: 0,
            notes: topicData.notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await api.saveStudyTopic(newTopic);
          setTopics((prev) => [...prev, newTopic]);
          showToast(`Topic "${newTopic.subtopic}" added to syllabus!`, 'success');
        }}
      />

      <ScheduleRevisionModal
        isOpen={isScheduleRevisionOpen}
        onClose={() => {
          setIsScheduleRevisionOpen(false);
          setActiveTopicForRevision(null);
        }}
        subjects={subjects}
        topics={topics}
        defaultSubjectCode={activeTopicForRevision?.subjectCode || (selectedSubjectCode !== 'all' ? selectedSubjectCode : undefined)}
        defaultTopicId={activeTopicForRevision?.id}
        onSchedule={async (revisionData) => {
          const newRev: StudyRevision = {
            id: `rev_${Date.now()}`,
            userId: user?.id || 'guest',
            topicId: revisionData.topicId!,
            subjectCode: revisionData.subjectCode!,
            topicTitle: revisionData.topicTitle!,
            lastStudiedAt: revisionData.lastStudiedAt || new Date().toISOString().slice(0, 10),
            nextRevisionAt: revisionData.nextRevisionAt!,
            intervalDays: revisionData.intervalDays || 1,
            repetition: 0,
            difficulty: revisionData.difficulty || 'medium',
            status: revisionData.status || 'scheduled',
            notes: revisionData.notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await api.saveStudyRevision(newRev);
          setRevisions((prev) => [...prev, newRev]);
          showToast(`Scheduled spaced revision for "${newRev.topicTitle}"`, 'success');
        }}
      />

      <LogStudyMistakeModal
        isOpen={isLogMistakeOpen}
        onClose={() => setIsLogMistakeOpen(false)}
        subjects={subjects}
        defaultSubjectCode={selectedSubjectCode !== 'all' ? selectedSubjectCode : undefined}
        onAdd={async (mistakeData: Partial<StudyMistake>) => {
          const newMistake: StudyMistake = {
            id: `mistake_${Date.now()}`,
            userId: user?.id || 'guest',
            date: mistakeData.date || new Date().toISOString().slice(0, 10),
            subjectCode: mistakeData.subjectCode!,
            subjectName: mistakeData.subjectName,
            topic: mistakeData.topic!,
            source: mistakeData.source || 'Practice Problem',
            severity: mistakeData.severity || 'High',
            trap: mistakeData.trap!,
            rootCause: mistakeData.rootCause!,
            goldenRule: mistakeData.goldenRule!,
            resolved: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await api.saveStudyMistake(newMistake);
          setMistakes((prev) => [newMistake, ...prev]);
          showToast(`Logged trap: Golden Rule saved!`, 'success');
        }}
      />
    </div>
  );
};
