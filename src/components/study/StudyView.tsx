import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { clientDataCache } from '../../lib/dataCache.ts';
import { auth } from '../../lib/firebase.ts';
import {
  syncStudyTopicCompletionToGoogleSheets,
  pollAndSyncGoogleSheetsToStudyOS,
  getStudySheetSyncState,
} from '../../lib/sheetHub/sheetStudySyncService.ts';
import { triggerStudyRoomEmote } from '../../lib/leaderboardService.ts';
import type { StudySheetSyncState } from '../../types/sheetHub.ts';
import { StudyProgressDashboard } from './StudyProgressDashboard.tsx';
import {
  AcademicTier,
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyMistake,
  RevisionDifficulty,
  StudyGoal,
  StudyPlan,
  StudyPlanTask,
  StudyResource,
  StudyExam,
  StudyNote,
  StudyActivityLog,
  StudyFlashcard,
  StudyQuiz,
  StudyExportPayload,
} from '../../types/study.ts';
import { FocusSession } from '../../types/index.ts';
import { DEFAULT_ACADEMIC_TIERS } from '../../data/studySeedData.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import {
  categorizeRevisions,
  computeStudyProgressSummary,
  deduplicateActiveStudyTopics,
  computeStudyPlanAnalytics,
  computeStudyGoalProgress,
  computeStudyExamReadiness,
  searchStudyWorkspace,
} from '../../lib/studyIntelligence.ts';
import { saveTimerState } from '../../lib/timerEngine.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  MotionStaggerGrid,
  MotionStaggerItem,
  SubtleConfetti,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { playStudyMilestoneSound } from '../../lib/sound.ts';
import { AnimatePresence, motion } from 'motion/react';
import { AddStudyTierModal } from './AddStudyTierModal.tsx';
import { AddStudySubjectModal } from './AddStudySubjectModal.tsx';
import { AddStudyTopicModal } from './AddStudyTopicModal.tsx';
import { ScheduleRevisionModal } from './ScheduleRevisionModal.tsx';
import { LogStudyMistakeModal } from './LogStudyMistakeModal.tsx';
import { AddStudyGoalModal } from './AddStudyGoalModal.tsx';
import { AddStudyPlanModal } from './AddStudyPlanModal.tsx';
import { AddStudyExamModal } from './AddStudyExamModal.tsx';
import { AddStudyNoteModal } from './AddStudyNoteModal.tsx';
import { AddStudyResourceModal } from './AddStudyResourceModal.tsx';
import { AddStudyFlashcardModal } from './AddStudyFlashcardModal.tsx';
import { TakeStudyQuizModal } from './TakeStudyQuizModal.tsx';
import { ExportRestoreStudyModal } from './ExportRestoreStudyModal.tsx';
import {
  isOverviewSubject,
  cleanupErroneousOverviewImportData,
  rollbackOverviewCleanup,
} from '../../lib/sheetHub/sheetToStudyImportEngine.ts';
import { SmartSyllabusTaskModal } from './SmartSyllabusTaskModal.tsx';
import { StudyPlansTab } from './StudyPlansTab.tsx';
import { StudyGoalsTab } from './StudyGoalsTab.tsx';
import { StudyExamsTab } from './StudyExamsTab.tsx';
import { StudyFlashcardsTab } from './StudyFlashcardsTab.tsx';
import { StudyNotesTab } from './StudyNotesTab.tsx';
import { StudyResourcesTab } from './StudyResourcesTab.tsx';
import { StudyQuizzesTab } from './StudyQuizzesTab.tsx';
import { StudyActivityTab } from './StudyActivityTab.tsx';
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
  Timer,
  Target,
  FileText,
  Link2,
  HelpCircle,
  History,
  Download,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Award,
  Pin,
  X,
  Loader2,
  Binary,
  GitBranch,
  PenTool,
  SlidersHorizontal,
  Layers,
} from 'lucide-react';
import { CoaMathMicroLab } from './CoaMathMicroLab.tsx';
import { SkillTreeLab } from './SkillTreeLab.tsx';
import { WhiteboardCanvas } from './WhiteboardCanvas.tsx';
import { ExamHallSimulator } from './ExamHallSimulator.tsx';

type StudySubTab =
  | 'overview'
  | 'syllabus'
  | 'plans'
  | 'goals'
  | 'exams'
  | 'revisions'
  | 'flashcards'
  | 'notes'
  | 'resources'
  | 'quizzes'
  | 'mistakes'
  | 'habits'
  | 'analytics'
  | 'activity'
  | 'microlab'
  | 'skilltree'
  | 'whiteboard'
  | 'simulator';

export const StudyView: React.FC = () => {
  const {
    user,
    settings,
    habits,
    refreshKey,
    triggerRefresh,
    showToast,
    setCurrentTab,
    timerMode,
    isRunning,
    switchTimerMode,
    setActiveStudySubjectCode,
    setActiveStudyTopicId,
    setActiveStudyActivityType,
  } = useApp();

  const { isDisabled, profile } = useMotionPreferences();
  const cachedSubs = clientDataCache.getStudySubjects();
  const cachedTops = clientDataCache.getStudyTopics();
  const cachedRevs = clientDataCache.getStudyRevisions();
  const cachedMists = clientDataCache.getStudyMistakes();
  const cachedSess = clientDataCache.getFocusSessions();
  const cachedPlanTasks = clientDataCache.getStudyPlanTasks();
  const hasCachedStudy = Boolean(cachedSubs && cachedSubs.length > 0);

  const [activeSubTab, setActiveSubTab] = useState<StudySubTab>('syllabus');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [headerToolsOpen, setHeaderToolsOpen] = useState(false);
  const [moreTabsOpen, setMoreTabsOpen] = useState(false);
  const [expandedModuleKeys, setExpandedModuleKeys] = useState<Record<string, boolean>>({});
  const [mistakeSeverityFilter, setMistakeSeverityFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');

  // Google Sheets Two-Way Sync State
  const [syncState, setSyncState] = useState<StudySheetSyncState | undefined>(undefined);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);

  // Live state
  const [subjects, setSubjects] = useState<StudySubject[]>(() => cachedSubs || []);
  const [topics, setTopics] = useState<StudyTopic[]>(() => cachedTops || []);
  const [revisions, setRevisions] = useState<StudyRevision[]>(() => cachedRevs || []);
  const [mistakes, setMistakes] = useState<StudyMistake[]>(() => cachedMists || []);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>(() => cachedSess || []);
  const [goals, setGoals] = useState<StudyGoal[]>([]);
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [planTasks, setPlanTasks] = useState<StudyPlanTask[]>(() => cachedPlanTasks || []);
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [activityLogs, setActivityLogs] = useState<StudyActivityLog[]>([]);
  const [flashcards, setFlashcards] = useState<StudyFlashcard[]>([]);
  const [quizzes, setQuizzes] = useState<StudyQuiz[]>([]);
  const [customTiers, setCustomTiers] = useState<AcademicTier[]>([]);
  const [loading, setLoading] = useState(!hasCachedStudy);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [celebratingTopicId, setCelebratingTopicId] = useState<string | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [deletingSubjectId, setDeletingSubjectId] = useState<string | null>(null);

  // Global search & filters state
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isBookmarksOnly, setIsBookmarksOnly] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => getTodayDateString());

  // Interactive flashcard deck state
  const [activeFlashcardIdx, setActiveFlashcardIdx] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);

  // Modals state
  const [isAddTierOpen, setIsAddTierOpen] = useState(false);
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [isAddTopicOpen, setIsAddTopicOpen] = useState(false);
  const [targetSubjectCodeForTopic, setTargetSubjectCodeForTopic] = useState<string | undefined>(undefined);
  const [isScheduleRevisionOpen, setIsScheduleRevisionOpen] = useState(false);
  const [isLogMistakeOpen, setIsLogMistakeOpen] = useState(false);
  const [activeTopicForRevision, setActiveTopicForRevision] = useState<StudyTopic | null>(null);
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [isAddResourceOpen, setIsAddResourceOpen] = useState(false);
  const [isAddFlashcardOpen, setIsAddFlashcardOpen] = useState(false);
  const [isExportRestoreOpen, setIsExportRestoreOpen] = useState(false);
  const [isSmartSyllabusModalOpen, setIsSmartSyllabusModalOpen] = useState(false);
  const [selectedQuizForAttempt, setSelectedQuizForAttempt] = useState<StudyQuiz | null>(null);
  const [isCleaningOverview, setIsCleaningOverview] = useState(false);
  const [isOverviewBannerDismissed, setIsOverviewBannerDismissed] = useState(false);
  const [cleanupUndoAvailable, setCleanupUndoAvailable] = useState(false);

  // User isolation & cancellation tracker (FIX 1 & FIX 2)
  const activeUserIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef<number>(0);

  // Load study entities
  const loadData = async () => {
    const currentUid = user?.id ?? null;
    const generation = ++loadGenerationRef.current;
    const isUserSwitch = activeUserIdRef.current !== currentUid;
    activeUserIdRef.current = currentUid;

    // Immediately clear Study data only when user switches or logs out
    if (isUserSwitch) {
      setSubjects([]);
      setTopics([]);
      setRevisions([]);
      setMistakes([]);
      setFocusSessions([]);
      setLoadError(null);
      setGoals([]);
      setPlans([]);
      setPlanTasks([]);
      setResources([]);
      setExams([]);
      setNotes([]);
      setActivityLogs([]);
      setFlashcards([]);
      setQuizzes([]);
    }

    // If user is not resolved or logged out, do not execute unauthenticated fetch or seed
    if (!currentUid) {
      setLoading(false);
      return;
    }

    if (isUserSwitch || (subjects.length === 0 && !hasCachedStudy)) {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const [
        subs,
        tops,
        revs,
        mists,
        sess,
        goalsData,
        plansData,
        tasksData,
        resData,
        examsData,
        notesData,
        logsData,
        flashcardsData,
        quizzesData,
        tiersData,
      ] = await Promise.all([
        api.getStudySubjects(),
        api.getStudyTopics(),
        api.getStudyRevisions(),
        api.getStudyMistakes(),
        api.getFocusSessions(),
        api.getStudyGoals(),
        api.getStudyPlans(),
        api.getStudyPlanTasks(),
        api.getStudyResources(),
        api.getStudyExams(),
        api.getStudyNotes(),
        api.getStudyActivityLogs(50),
        api.getStudyFlashcards(),
        api.getStudyQuizzes(),
        api.getStudyTiers().catch(() => []),
      ]);

      // If user switched or another load triggered while waiting, ignore stale response
      if (generation !== loadGenerationRef.current || activeUserIdRef.current !== currentUid) {
        return;
      }

      setSubjects(subs);
      clientDataCache.setStudySubjects(subs);
      setTopics(tops);
      clientDataCache.setStudyTopics(tops);
      setRevisions(revs);
      clientDataCache.setStudyRevisions(revs);
      setMistakes(mists);
      clientDataCache.setStudyMistakes(mists);
      setFocusSessions(sess);
      setGoals(goalsData);
      setPlans(plansData);
      setPlanTasks(tasksData);
      clientDataCache.setStudyPlanTasks(tasksData);
      setResources(resData);
      setExams(examsData);
      setNotes(notesData);
      setActivityLogs(logsData);
      setFlashcards(flashcardsData);
      setQuizzes(quizzesData);
      setCustomTiers(tiersData || []);
      setLoadError(null);
      setIsStale(false);
    } catch (err: unknown) {
      if (generation !== loadGenerationRef.current || activeUserIdRef.current !== currentUid) {
        return;
      }
      console.error('Failed to load study data:', err);
      const msg = err instanceof Error ? err.message : 'Error loading study data.';
      if (subjects.length > 0 || (cachedSubs && cachedSubs.length > 0)) {
        setIsStale(true);
      } else {
        setLoadError(msg);
      }
      showToast('Error loading study data. Please retry.', 'error');
    } finally {
      if (generation === loadGenerationRef.current && activeUserIdRef.current === currentUid) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [user, refreshKey]);

  useEffect(() => {
    return () => {
      loadGenerationRef.current++;
    };
  }, []);

  const studyTz = settings?.timezone || DEFAULT_TIMEZONE;

  // Derived calculations
  const progressSummary = useMemo(() => {
    return computeStudyProgressSummary({
      subjects,
      topics,
      revisions,
      mistakes,
      focusSessions,
      timezone: studyTz,
    });
  }, [subjects, topics, revisions, mistakes, focusSessions, studyTz]);

  const categorizedRevs = useMemo(() => {
    return categorizeRevisions(revisions, studyTz);
  }, [revisions, studyTz]);

  const detectedOverviewSubjects = useMemo(() => {
    return subjects.filter((s) => !s.deletedAt && isOverviewSubject(s));
  }, [subjects]);

  const handleCleanOverviewData = async () => {
    const activeUserId = user?.id || auth.currentUser?.uid;
    if (!activeUserId) return;
    setIsCleaningOverview(true);
    try {
      const res = await cleanupErroneousOverviewImportData(activeUserId);
      if (res.removedSubjectCount > 0 || res.removedTopicsCount > 0) {
        setSubjects((prev) => prev.filter((s) => !isOverviewSubject(s)));
        setTopics((prev) => prev.filter((t) => !isOverviewSubject({ code: t.subjectCode })));
        setCleanupUndoAvailable(true);
        showToast(
          `Cleaned up ${res.removedSubjectCount} Overview subject and ${res.removedTopicsCount} erroneous topic(s). Genuine subjects preserved!`,
          'success'
        );
      } else {
        showToast('No Overview import data found to clean.', 'info');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Cleanup failed', 'error');
    } finally {
      setIsCleaningOverview(false);
    }
  };

  const handleRollbackOverviewCleanup = async () => {
    const activeUserId = user?.id || auth.currentUser?.uid;
    if (!activeUserId) return;
    try {
      const res = await rollbackOverviewCleanup(activeUserId);
      showToast(`Restored ${res.restoredSubjectsCount} subject(s) and ${res.restoredTopicsCount} topic(s).`, 'success');
      setCleanupUndoAvailable(false);
      void loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Undo failed', 'error');
    }
  };

  // Synchronize Google Sheets checkboxes with Study OS (Two-Way Sync)
  const handleManualSyncSheets = async () => {
    if (isSyncingSheets) return;
    setIsSyncingSheets(true);
    const activeUserId = user?.id || auth.currentUser?.uid || 'usr_guest';
    try {
      const report = await pollAndSyncGoogleSheetsToStudyOS(activeUserId, { manual: true });
      if (report.success) {
        if (report.updatedTopicsCount > 0) {
          showToast(
            report.error
              ? `Updated ${report.updatedTopicsCount} topic(s) from Sheet Hub cache. ${report.error}`
              : `Synced with Google Sheets: updated ${report.updatedTopicsCount} topic${
                  report.updatedTopicsCount === 1 ? '' : 's'
                } across ${report.updatedSubjectsCount} subject${
                  report.updatedSubjectsCount === 1 ? '' : 's'
                }.`,
            report.error ? 'info' : 'success'
          );
          await loadData();
        } else if (report.error) {
          showToast(report.error, 'info');
        } else {
          showToast('Google Sheets and Study OS are already up to date.', 'info');
        }
      } else {
        showToast(report.error || 'Failed to sync with Google Sheets', 'error');
      }
      const freshState = await getStudySheetSyncState(activeUserId);
      setSyncState(freshState);
    } catch (err) {
      console.error('[StudyView] Manual sheets sync error:', err);
      showToast('Error syncing with Google Sheets', 'error');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Load sync state on mount and when refresh triggers
  useEffect(() => {
    const activeUserId = user?.id || auth.currentUser?.uid;
    if (!activeUserId) return;
    getStudySheetSyncState(activeUserId)
      .then((s) => setSyncState(s))
      .catch(() => {});
  }, [user?.id, refreshKey]);

  // Combined Academic Tiers (default + user-created)
  const allTiers = useMemo<AcademicTier[]>(() => {
    const defaults = DEFAULT_ACADEMIC_TIERS;
    const customFiltered = (customTiers || []).filter(
      (ct) => !defaults.some((dt) => dt.id === ct.id) && !ct.deletedAt
    );
    return [...defaults, ...customFiltered];
  }, [customTiers]);

  // Filtered subjects by tier
  const visibleSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (s.deletedAt) return false;
      if (selectedTier === 'all') return true;
      return s.tierId === selectedTier;
    });
  }, [subjects, selectedTier]);

  // Canonical deduplicated active topics aligned with KPI & subject cards
  const activeTopics = useMemo(() => {
    const activeSubs = subjects.filter((s) => !s.deletedAt);
    return deduplicateActiveStudyTopics(topics, activeSubs);
  }, [topics, subjects]);

  // Filtered topics by subject, search query, and bookmarks
  const visibleTopics = useMemo(() => {
    return activeTopics.filter((t) => {
      if (isBookmarksOnly && !t.isBookmarked) return false;
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
  }, [activeTopics, selectedSubjectCode, searchQuery, isBookmarksOnly]);

  // Group visible topics by Subject + Module/Unit for clean collapsible accordions
  const groupedSyllabusModules = useMemo(() => {
    const subjectMap = new Map(subjects.map((s) => [s.code, s]));
    const groups = new Map<
      string,
      {
        key: string;
        subjectCode: string;
        subjectName: string;
        subjectColor: string;
        unit: string;
        topics: StudyTopic[];
        masteredCount: number;
        theoryCount: number;
      }
    >();

    for (const item of visibleTopics) {
      const sub = subjectMap.get(item.subjectCode);
      const unitLabel = (item.unit || 'General Unit').trim();
      const key = `${item.subjectCode}::${unitLabel}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          subjectCode: item.subjectCode,
          subjectName: sub?.name || item.subjectCode.replace(/^sub_/i, ''),
          subjectColor: sub?.color || '#6366f1',
          unit: unitLabel,
          topics: [],
          masteredCount: 0,
          theoryCount: 0,
        };
        groups.set(key, group);
      }
      group.topics.push(item);
      if (item.theory && item.practice) group.masteredCount++;
      if (item.theory) group.theoryCount++;
    }

    return Array.from(groups.values());
  }, [visibleTopics, subjects]);

  const isModuleExpanded = (key: string, idx: number): boolean => {
    if (searchQuery.trim().length > 0) return true;
    if (key in expandedModuleKeys) return Boolean(expandedModuleKeys[key]);
    return idx === 0;
  };

  const toggleModuleExpanded = (key: string, idx: number) => {
    const currentlyOpen = isModuleExpanded(key, idx);
    setExpandedModuleKeys((prev) => ({ ...prev, [key]: !currentlyOpen }));
  };

  const handleToggleAllModules = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of groupedSyllabusModules) {
      next[g.key] = expand;
    }
    setExpandedModuleKeys(next);
  };

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

  // Topic Checkbox Handlers with Automatic Google Sheets Checkbox Write-Back
  const handleToggleTopicFlag = async (topicId: string, flag: 'theory' | 'practice' | 'pyq') => {
    const existing = topics.find((t) => t.id === topicId);
    if (!existing) return;

    const wasCompleted = Boolean(existing.theory && existing.practice);
    const updated: StudyTopic = {
      ...existing,
      [flag]: !existing[flag],
      updatedAt: new Date().toISOString(),
    };
    const isCompleted = Boolean(updated.theory && updated.practice);

    // Optimistic state
    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    if (!existing[flag]) {
      playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume);
    }

    try {
      await api.saveStudyTopic(updated);
      showToast(`Updated ${flag.toUpperCase()} for "${existing.subtopic}"`, 'success');

      // Checkbox Write-Back Bridge to connected Google Sheets
      const activeUserId = user?.id || auth.currentUser?.uid || 'usr_guest';
      const subject = subjects.find((s) => s.code === updated.subjectCode);
      if (wasCompleted !== isCompleted) {
        syncStudyTopicCompletionToGoogleSheets(activeUserId, updated, isCompleted, subject?.name)
          .then((res) => {
            if (res.status === 'synced' && res.cellRef) {
              showToast(
                `Synced checkbox to Google Sheets (${res.cellRef} = ${isCompleted ? 'TRUE' : 'FALSE'})`,
                'success'
              );
            } else if (res.status === 'queued') {
              showToast(
                'Google Sheets authorization expired. Reconnect in Sheet Hub to sync pending updates.',
                'info'
              );
            }
          })
          .catch((err) => console.warn('[StudySync] Background sheets sync error:', err));
      }
    } catch (err) {
      console.error('Failed to update topic status:', err);
      showToast('Could not save progress', 'error');
      // Rollback
      setTopics((prev) => prev.map((t) => (t.id === topicId ? existing : t)));
    }
  };

  // Direct Master Completion Toggle (sets theory + practice together and syncs to Google Sheets)
  const handleToggleTopicCompleted = async (topicId: string) => {
    const existing = topics.find((t) => t.id === topicId);
    if (!existing) return;

    const isCurrentlyDone = Boolean(existing.theory && existing.practice);
    const nextDone = !isCurrentlyDone;

    const updated: StudyTopic = {
      ...existing,
      theory: nextDone,
      practice: nextDone,
      pyq: nextDone ? true : existing.pyq,
      updatedAt: new Date().toISOString(),
    };

    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    if (nextDone) {
      playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume);
      setCelebratingTopicId(topicId);
      setTimeout(() => setCelebratingTopicId((c) => (c === topicId ? null : c)), 1400);
    }

    try {
      await api.saveStudyTopic(updated);
      showToast(
        nextDone
          ? `Marked "${existing.subtopic || existing.topic}" as Completed`
          : `Unmarked "${existing.subtopic || existing.topic}"`,
        'success'
      );

      const activeUserId = user?.id || auth.currentUser?.uid || 'usr_guest';
      if (nextDone && activeUserId && !activeUserId.startsWith('usr_guest')) {
        void triggerStudyRoomEmote({ uid: activeUserId, type: 'celebrate' });
      }
      if (nextDone) {
        void api
          .awardXP({
            eventId: `topic_${updated.id}`,
            source: 'topic_completion',
            sourceId: updated.id,
          })
          .then((xpRes) => {
            if (xpRes?.awarded && xpRes.xpAdded > 0) {
              showToast(
                xpRes.leveledUp
                  ? `+${xpRes.xpAdded} XP · Level Up to Lv.${xpRes.newLevel}! 🎉`
                  : `+${xpRes.xpAdded} XP earned!`,
                'success'
              );
            }
          });
      }
      const subject = subjects.find((s) => s.code === updated.subjectCode);
      syncStudyTopicCompletionToGoogleSheets(activeUserId, updated, nextDone, subject?.name)
        .then((res) => {
          if (res.status === 'synced' && res.cellRef) {
            showToast(
              `Synced ${nextDone ? 'TRUE' : 'FALSE'} to Google Sheets (${res.cellRef})`,
              'success'
            );
          } else if (res.status === 'queued') {
            showToast(
              'Google Sheets authorization expired. Reconnect in Sheet Hub to sync pending updates.',
              'info'
            );
          }
        })
        .catch((err) => console.warn('[StudySync] Background sheets sync error:', err));
    } catch (err) {
      console.error('Failed to toggle topic completion:', err);
      showToast('Could not save progress', 'error');
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
      playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume);
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

  // Academic Tier Handlers
  const handleAddTier = async (newTier: Partial<AcademicTier>) => {
    try {
      const created = await api.saveStudyTier(newTier);
      setCustomTiers((prev) => [...prev.filter((t) => t.id !== created.id), created]);
      setSelectedTier(created.id);
      showToast(`Academic tier "${created.name}" created`, 'success');
    } catch (err) {
      console.error('Failed to create academic tier:', err);
      showToast('Failed to create academic tier', 'error');
    }
  };

  const handleDeleteTier = async (tier: AcademicTier, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete academic tier "${tier.name}"? Subjects assigned to it will remain intact.`)) return;
    setCustomTiers((prev) => prev.filter((t) => t.id !== tier.id));
    if (selectedTier === tier.id) {
      setSelectedTier('all');
    }
    try {
      await api.deleteStudyTier(tier.id);
      showToast(`Tier "${tier.name}" removed`, 'info');
    } catch (err) {
      console.error('Failed to delete tier:', err);
      showToast('Failed to delete tier', 'error');
      void loadData();
    }
  };

  const handleClearAllStudyData = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete ALL study subjects and topics? This will clear all subjects, topics, revisions, and mistakes.'
      )
    ) {
      return;
    }

    setSubjects([]);
    setTopics([]);
    setRevisions([]);
    setMistakes([]);
    setSelectedSubjectCode('all');

    try {
      await api.clearStudyData();
      showToast('All study subjects and topics removed', 'info');
    } catch (err) {
      console.error('Failed to clear study data:', err);
      showToast('Failed to clear study data', 'error');
      void loadData();
    }
  };

  // Delete handlers
  const handleOpenAddTopic = (subCode?: string) => {
    const code = subCode || (selectedSubjectCode !== 'all' ? selectedSubjectCode : undefined);
    setTargetSubjectCodeForTopic(code);
    setIsAddTopicOpen(true);
  };

  const handleDeleteSubject = async (subject: StudySubject) => {
    const targetKey = subject.id || subject.code;
    if (deletingSubjectId) return;

    const subTopics = topics.filter((t) => t.subjectCode === subject.code && !t.deletedAt);
    const confirmMsg =
      subTopics.length > 0
        ? `Are you sure you want to delete "${subject.name}" (${subject.code}) and its ${subTopics.length} topic${
            subTopics.length > 1 ? 's' : ''
          }?`
        : `Are you sure you want to delete "${subject.name}" (${subject.code})?`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingSubjectId(targetKey);

    try {
      await api.deleteStudySubject(targetKey);

      setSubjects((prev) => prev.filter((s) => s.id !== subject.id && s.code !== subject.code));
      if (subTopics.length > 0) {
        setTopics((prev) => prev.filter((t) => t.subjectCode !== subject.code));
      }
      if (selectedSubjectCode === subject.code) {
        setSelectedSubjectCode('all');
      }

      showToast(`Subject "${subject.name}" and associated topics deleted`, 'info');
    } catch (err: unknown) {
      console.error('Failed to delete subject:', err);
      const errMsg = err instanceof Error && err.message ? err.message : 'Failed to delete subject';
      showToast(errMsg, 'error');
      await loadData();
    } finally {
      setDeletingSubjectId(null);
    }
  };

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

  // Topic Bookmark Toggle
  const handleToggleTopicBookmark = async (topicId: string) => {
    const existing = topics.find((t) => t.id === topicId);
    if (!existing) return;
    const updated: StudyTopic = {
      ...existing,
      isBookmarked: !existing.isBookmarked,
      updatedAt: new Date().toISOString(),
    };
    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    try {
      await api.saveStudyTopic(updated);
      showToast(updated.isBookmarked ? 'Topic bookmarked' : 'Bookmark removed', 'info');
    } catch (err) {
      setTopics((prev) => prev.map((t) => (t.id === topicId ? existing : t)));
    }
  };

  // Global Workspace Search
  const searchResults = useMemo(() => {
    if (!globalSearchQuery.trim()) return [];
    return searchStudyWorkspace(globalSearchQuery, {
      subjects,
      topics,
      notes,
      resources,
      exams,
      plans,
      flashcards,
    });
  }, [globalSearchQuery, subjects, topics, notes, resources, exams, plans, flashcards]);

  // Data Export & Restore Handlers
  const handleExportWorkspace = async (): Promise<StudyExportPayload> => {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      userId: user?.id || 'guest',
      subjects,
      topics,
      revisions,
      mistakes,
      goals,
      plans,
      planTasks,
      resources,
      exams,
      notes,
      flashcards,
      quizzes,
    };
  };

  const handleRestoreWorkspace = async (payload: StudyExportPayload) => {
    setLoading(true);
    try {
      for (const s of payload.subjects) await api.saveStudySubject(s);
      for (const t of payload.topics) await api.saveStudyTopic(t);
      for (const r of payload.revisions) await api.saveStudyRevision(r);
      for (const m of payload.mistakes) await api.saveStudyMistake(m);
      for (const g of payload.goals) await api.saveStudyGoal(g);
      for (const p of payload.plans) await api.saveStudyPlan(p);
      for (const pt of payload.planTasks) await api.saveStudyPlanTask(pt);
      for (const res of payload.resources) await api.saveStudyResource(res);
      for (const ex of payload.exams) await api.saveStudyExam(ex);
      for (const n of payload.notes) await api.saveStudyNote(n);
      for (const fc of payload.flashcards) await api.saveStudyFlashcard(fc);
      for (const q of payload.quizzes) await api.saveStudyQuiz(q);
      await loadData();
      showToast('Study workspace successfully restored!', 'success');
    } catch (err) {
      console.error('Failed to restore study workspace:', err);
      showToast('Failed to restore workspace items', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Goal handlers
  const handleCreateGoal = async (goalData: Partial<StudyGoal>) => {
    const newGoal: StudyGoal = {
      id: `goal_${Date.now()}`,
      userId: user?.id || 'guest',
      title: goalData.title!,
      description: goalData.description || '',
      goalType: goalData.goalType || 'monthly',
      subjectId: goalData.subjectCode || null,
      subjectCode: goalData.subjectCode || null,
      targetValue: goalData.targetValue || 1,
      currentValue: 0,
      unit: goalData.unit || 'topics',
      startDate: goalData.startDate || getTodayDateString(),
      endDate: goalData.endDate || getTodayDateString(),
      status: 'active',
      priority: goalData.priority || 'medium',
      milestones: goalData.milestones || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await api.saveStudyGoal(newGoal);
    setGoals((prev) => [newGoal, ...prev]);
    showToast(`Goal "${newGoal.title}" created!`, 'success');
  };

  const handleToggleGoalMilestone = async (goalId: string, milestoneId: string) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const updatedMilestones = (goal.milestones || []).map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    const updated: StudyGoal = {
      ...goal,
      milestones: updatedMilestones,
      updatedAt: new Date().toISOString(),
    };
    setGoals((prev) => prev.map((g) => (g.id === goalId ? updated : g)));
    try {
      await api.saveStudyGoal(updated);
      playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume);
    } catch (err) {
      setGoals((prev) => prev.map((g) => (g.id === goalId ? goal : g)));
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!window.confirm('Delete this academic goal?')) return;
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
    try {
      await api.deleteStudyGoal(goalId);
      showToast('Goal removed', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Plan & Task Handlers
  const handleCreatePlan = async (planData: Partial<StudyPlan>) => {
    const newPlan: StudyPlan = {
      id: `plan_${Date.now()}`,
      userId: user?.id || 'guest',
      title: planData.title!,
      description: planData.description || '',
      planType: planData.planType || 'weekly',
      subjectIds: planData.subjectIds || [],
      startDate: planData.startDate || getTodayDateString(),
      endDate: planData.endDate || getTodayDateString(),
      dailyTargetMinutes: planData.dailyTargetMinutes || 120,
      weeklyTargetMinutes: planData.weeklyTargetMinutes || 600,
      recurringPattern: planData.recurringPattern || 'none',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await api.saveStudyPlan(newPlan);
    setPlans((prev) => [newPlan, ...prev]);
    showToast(`Study plan "${newPlan.title}" created!`, 'success');
  };

  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm('Delete this study plan?')) return;
    setPlans((prev) => prev.filter((p) => p.id !== planId));
    try {
      await api.deleteStudyPlan(planId);
      showToast('Study plan deleted', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickAddTask = async (title: string, estimatedMinutes: number, subjectCode?: string) => {
    const activePlan = plans.find((p) => !p.deletedAt);
    const newTask: StudyPlanTask = {
      id: `task_${Date.now()}`,
      planId: activePlan?.id || 'general',
      userId: user?.id || 'guest',
      title,
      description: '',
      subjectId: subjectCode || null,
      topicId: null,
      scheduledDate: selectedCalendarDate,
      startTime: null,
      endTime: null,
      estimatedMinutes,
      actualMinutes: 0,
      priority: 'medium',
      status: 'pending',
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await api.saveStudyPlanTask(newTask);
    setPlanTasks((prev) => [newTask, ...prev]);
    showToast('Task added to schedule!', 'success');
  };

  const handleToggleTaskStatus = async (task: StudyPlanTask) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    const updated: StudyPlanTask = {
      ...task,
      status: nextStatus,
      completedAt: nextStatus === 'completed' ? new Date().toISOString() : null,
      actualMinutes: nextStatus === 'completed' ? (task.actualMinutes || task.estimatedMinutes || 30) : 0,
      updatedAt: new Date().toISOString(),
    };
    setPlanTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    try {
      await api.saveStudyPlanTask(updated);
      if (nextStatus === 'completed') {
        playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume);
        showToast('Plan task marked complete!', 'success');
      }
    } catch (err) {
      setPlanTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  };

  const handleDeletePlanTask = async (taskId: string) => {
    setPlanTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await api.deleteStudyPlanTask(taskId);
      showToast('Task removed', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Exam Handlers
  const handleCreateExam = async (examData: Partial<StudyExam>) => {
    const newExam: StudyExam = {
      id: `exam_${Date.now()}`,
      userId: user?.id || 'guest',
      title: examData.title!,
      examType: examData.examType || 'Semester Final',
      subjectIds: examData.subjectIds || [],
      syllabusTopicIds: examData.syllabusTopicIds || [],
      examDate: examData.examDate || getTodayDateString(),
      startTime: examData.startTime || null,
      durationMinutes: examData.durationMinutes || 180,
      totalMarks: examData.totalMarks || 100,
      obtainedMarks: null,
      preparationStatus: examData.preparationStatus || 'preparing',
      resultStatus: 'pending',
      notes: examData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await api.saveStudyExam(newExam);
    setExams((prev) => [newExam, ...prev]);
    showToast(`Exam "${newExam.title}" scheduled!`, 'success');
  };

  const handleDeleteExam = async (examId: string) => {
    if (!window.confirm('Delete this exam entry?')) return;
    setExams((prev) => prev.filter((e) => e.id !== examId));
    try {
      await api.deleteStudyExam(examId);
      showToast('Exam schedule deleted', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Note Handlers
  const handleCreateNote = async (noteData: Partial<StudyNote>) => {
    const newNote: StudyNote = {
      id: `note_${Date.now()}`,
      userId: user?.id || 'guest',
      title: noteData.title!,
      content: noteData.content || '',
      subjectId: noteData.subjectId || subjects[0]?.code || null,
      topicId: noteData.topicId || null,
      tags: noteData.tags || [],
      isPinned: noteData.isPinned || false,
      isBookmarked: noteData.isBookmarked || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await api.saveStudyNote(newNote);
    setNotes((prev) => [newNote, ...prev]);
    showToast(`Note "${newNote.title}" saved!`, 'success');
  };

  const handleToggleNotePin = async (note: StudyNote) => {
    const updated: StudyNote = {
      ...note,
      isPinned: !note.isPinned,
      updatedAt: new Date().toISOString(),
    };
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
    try {
      await api.saveStudyNote(updated);
    } catch (err) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
    }
  };

  const handleToggleNoteBookmark = async (note: StudyNote) => {
    const updated: StudyNote = {
      ...note,
      isBookmarked: !note.isBookmarked,
      updatedAt: new Date().toISOString(),
    };
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
    try {
      await api.saveStudyNote(updated);
      showToast(updated.isBookmarked ? 'Note bookmarked' : 'Bookmark removed', 'info');
    } catch (err) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Delete this note?')) return;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    try {
      await api.deleteStudyNote(noteId);
      showToast('Note deleted', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Resource Handlers
  const handleCreateResource = async (resData: Partial<StudyResource>) => {
    const newRes: StudyResource = {
      id: `res_${Date.now()}`,
      userId: user?.id || 'guest',
      title: resData.title!,
      description: resData.description || '',
      resourceType: resData.resourceType || 'link',
      url: resData.url || null,
      subjectId: resData.subjectId || null,
      topicId: resData.topicId || null,
      storagePath: null,
      tags: resData.tags || [],
      isBookmarked: resData.isBookmarked || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await api.saveStudyResource(newRes);
    setResources((prev) => [newRes, ...prev]);
    showToast(`Resource "${newRes.title}" saved!`, 'success');
  };

  const handleToggleResourceBookmark = async (resource: StudyResource) => {
    const updated: StudyResource = {
      ...resource,
      isBookmarked: !resource.isBookmarked,
      updatedAt: new Date().toISOString(),
    };
    setResources((prev) => prev.map((r) => (r.id === resource.id ? updated : r)));
    try {
      await api.saveStudyResource(updated);
      showToast(updated.isBookmarked ? 'Resource bookmarked' : 'Bookmark removed', 'info');
    } catch (err) {
      setResources((prev) => prev.map((r) => (r.id === resource.id ? resource : r)));
    }
  };

  const handleDeleteResource = async (resId: string) => {
    if (!window.confirm('Delete this resource?')) return;
    setResources((prev) => prev.filter((r) => r.id !== resId));
    try {
      await api.deleteStudyResource(resId);
      showToast('Resource removed', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Flashcard Handlers
  const handleCreateFlashcard = async (cardData: Partial<StudyFlashcard>) => {
    const newCard: StudyFlashcard = {
      id: `card_${Date.now()}`,
      userId: user?.id || 'guest',
      question: cardData.question!,
      answer: cardData.answer!,
      subjectId: cardData.subjectId || subjects[0]?.code || null,
      topicId: cardData.topicId || null,
      difficulty: cardData.difficulty || 'medium',
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: getTodayDateString(),
      isBookmarked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await api.saveStudyFlashcard(newCard);
    setFlashcards((prev) => [newCard, ...prev]);
    showToast('Flashcard created!', 'success');
  };

  const handleReviewFlashcard = async (cardId: string, diff: 'easy' | 'medium' | 'hard') => {
    try {
      const updated = await api.reviewStudyFlashcard(cardId, diff);
      if (updated) {
        setFlashcards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      }
      playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume);
      showToast(
        diff === 'easy' ? 'Card Mastered!' : diff === 'medium' ? 'Review Logged!' : 'Needs Revision!',
        'success'
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFlashcardBookmark = async (card: StudyFlashcard) => {
    const updated: StudyFlashcard = {
      ...card,
      isBookmarked: !card.isBookmarked,
      updatedAt: new Date().toISOString(),
    };
    setFlashcards((prev) => prev.map((c) => (c.id === card.id ? updated : c)));
    try {
      await api.saveStudyFlashcard(updated);
      showToast(updated.isBookmarked ? 'Flashcard bookmarked' : 'Bookmark removed', 'info');
    } catch (err) {
      setFlashcards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
    }
  };

  const handleDeleteFlashcard = async (cardId: string) => {
    if (!window.confirm('Delete this flashcard?')) return;
    setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
    try {
      await api.deleteStudyFlashcard(cardId);
      showToast('Flashcard removed', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Quiz Handlers
  const handleRecordQuizAttempt = async (
    quizId: string,
    attempt: { score: number; totalQuestions: number; timeTakenSeconds: number }
  ) => {
    try {
      const updated = await api.recordStudyQuizAttempt(quizId, attempt);
      if (updated) {
        setQuizzes((prev) => prev.map((q) => (q.id === quizId ? updated : q)));
      }
      playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume);
      showToast(`Quiz completed! Score: ${attempt.score}/${attempt.totalQuestions}`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to record attempt', 'error');
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!window.confirm('Delete this quiz?')) return;
    setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    try {
      await api.deleteStudyQuiz(quizId);
      showToast('Quiz deleted', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Calm Compact Header with Primary Actions & Tools Dropdown */}
      <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--ff-text-primary)] whitespace-nowrap">
                Study OS
              </h1>
              {isBookmarksOnly && (
                <ThemeBadge tone="warning">Bookmarks Filter</ThemeBadge>
              )}
            </div>
            <p className="text-xs text-[var(--ff-text-muted)] truncate">
              Syllabus mastery, spaced repetition &amp; mistake diagnostics
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Compact Global Search */}
          <div className="relative flex-1 sm:flex-none min-w-[140px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Search Study OS..."
              className="w-full sm:w-44 pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            />
            {searchResults.length > 0 && (
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] max-h-72 overflow-y-auto rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] shadow-xl z-50 p-2 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] px-2 py-1 block">
                  Search Results ({searchResults.length})
                </span>
                {searchResults.map((res) => (
                  <div
                    key={`${res.type}_${res.id}`}
                    onClick={() => {
                      if (res.type === 'subject') {
                        setSelectedSubjectCode(res.tag || 'all');
                        setActiveSubTab('syllabus');
                      } else if (res.type === 'topic') {
                        setActiveSubTab('syllabus');
                      } else if (res.type === 'note') {
                        setActiveSubTab('notes');
                      } else if (res.type === 'resource') {
                        setActiveSubTab('resources');
                      } else if (res.type === 'exam') {
                        setActiveSubTab('exams');
                      } else if (res.type === 'plan') {
                        setActiveSubTab('plans');
                      } else if (res.type === 'flashcard') {
                        setActiveSubTab('flashcards');
                      }
                      setGlobalSearchQuery('');
                    }}
                    className="p-2 rounded-xl hover:bg-[var(--ff-surface-muted)] cursor-pointer text-xs transition-colors flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--ff-text-primary)] truncate max-w-[200px]">
                        {res.title}
                      </div>
                      <div className="text-[10px] text-[var(--ff-text-muted)] truncate max-w-[200px]">
                        {res.subtitle}
                      </div>
                    </div>
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)] shrink-0">
                      {res.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Primary Actions */}
          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => handleOpenAddTopic()}
            className="flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Topic</span>
          </ThemeButton>

          <ThemeButton
            variant="primary"
            size="sm"
            onClick={() => setIsAddSubjectOpen(true)}
            className="flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Subject</span>
          </ThemeButton>

          {/* Tools Dropdown */}
          <div className="relative">
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setMoreTabsOpen(false);
                setHeaderToolsOpen((o) => !o);
              }}
              className="flex items-center gap-1.5"
              aria-expanded={headerToolsOpen}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Tools</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${headerToolsOpen ? 'rotate-180' : ''}`} />
            </ThemeButton>

            {headerToolsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setHeaderToolsOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-2 w-60 rounded-2xl bg-[var(--ff-surface-elevated)] border border-[var(--ff-border-color)] shadow-2xl z-50 p-1.5 space-y-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderToolsOpen(false);
                      void handleManualSyncSheets();
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center gap-2.5 text-emerald-400 font-medium text-left"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                    <span>Sync Sheets Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderToolsOpen(false);
                      setCurrentTab('sheet_hub');
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center gap-2.5 text-[var(--ff-text-primary)] text-left"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Open Sheet Sync Hub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderToolsOpen(false);
                      setIsSmartSyllabusModalOpen(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center gap-2.5 text-[var(--ff-text-primary)] text-left"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Syllabus to Tasks</span>
                  </button>
                  <div className="my-1 border-t border-[var(--ff-border-color)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderToolsOpen(false);
                      setActiveTopicForRevision(null);
                      setIsScheduleRevisionOpen(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center gap-2.5 text-[var(--ff-text-primary)] text-left"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Schedule Revision</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderToolsOpen(false);
                      setIsLogMistakeOpen(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center gap-2.5 text-[var(--ff-text-primary)] text-left"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Log Mistake / Trap</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderToolsOpen(false);
                      setIsAddTierOpen(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center gap-2.5 text-[var(--ff-text-primary)] text-left"
                  >
                    <Layers className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                    <span>New Academic Tier</span>
                  </button>
                  <div className="my-1 border-t border-[var(--ff-border-color)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsBookmarksOnly(!isBookmarksOnly);
                      setHeaderToolsOpen(false);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center justify-between text-[var(--ff-text-primary)] text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <Bookmark className="w-3.5 h-3.5 text-amber-400" fill={isBookmarksOnly ? 'currentColor' : 'none'} />
                      <span>Bookmarks Only</span>
                    </span>
                    {isBookmarksOnly && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderToolsOpen(false);
                      setIsExportRestoreOpen(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-[var(--ff-surface-muted)] flex items-center gap-2.5 text-[var(--ff-text-primary)] text-left"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
                    <span>Export / Restore Data</span>
                  </button>
                  {subjects.length > 0 && (
                    <>
                      <div className="my-1 border-t border-[var(--ff-border-color)]" />
                      <button
                        type="button"
                        onClick={() => {
                          setHeaderToolsOpen(false);
                          void handleClearAllStudyData();
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-rose-500/10 flex items-center gap-2.5 text-rose-400 text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear All Subjects</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Erroneously Imported Overview Data Cleanup Banner */}
      {!isOverviewBannerDismissed && detectedOverviewSubjects.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[var(--ff-text-primary)] text-sm">
                Erroneously Imported Overview Sheet Detected
              </p>
              <p className="text-[var(--ff-text-muted)] mt-0.5 leading-relaxed">
                Found {detectedOverviewSubjects.length} subject ({detectedOverviewSubjects.map((s) => s.name || s.code).join(', ')}) containing summary aggregate counts instead of syllabus topics. Clean it up safely without affecting genuine subjects (DBMS, COA, Python, etc.).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeButton
              variant="secondary"
              size="sm"
              loading={isCleaningOverview}
              onClick={() => void handleCleanOverviewData()}
              className="text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clean Up Erroneous Data
            </ThemeButton>
            <button
              type="button"
              onClick={() => setIsOverviewBannerDismissed(true)}
              className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              title="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {cleanupUndoAvailable && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-2 text-xs text-emerald-400">
          <span>Overview data cleaned up. Undo snapshot available.</span>
          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => void handleRollbackOverviewCleanup()}
            className="text-xs text-emerald-400 hover:underline"
          >
            Undo Cleanup
          </ThemeButton>
        </div>
      )}

      {/* Top Academic Pulse KPI Cards */}
      <MotionStaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Syllabus Completion</span>
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={
                    progressSummary.overallCompletionPct > 0
                      ? progressSummary.overallCompletionPct
                      : progressSummary.totalTopics > 0
                      ? Math.round((progressSummary.theoryCompleted / progressSummary.totalTopics) * 100)
                      : 0
                  }
                  format={(v) => `${Math.round(v)}%`}
                />
              </span>
              <span className="text-xs font-mono tabular-nums text-[var(--ff-text-muted)]">
                {progressSummary.overallCompletionPct > 0
                  ? `${progressSummary.completedTopics}/${progressSummary.totalTopics} fully mastered`
                  : progressSummary.theoryCompleted > 0
                  ? `${progressSummary.theoryCompleted}/${progressSummary.totalTopics} theory · ${progressSummary.completedTopics} mastered`
                  : `${progressSummary.completedTopics}/${progressSummary.totalTopics} fully mastered`}
              </span>
            </div>
            {progressSummary.theoryCompleted > 0 && (
              <div className="mt-1 flex items-center justify-between text-[11px] text-blue-400 font-mono">
                <span>Theory Covered</span>
                <span>
                  {progressSummary.theoryCompleted}/{progressSummary.totalTopics} ({progressSummary.totalTopics > 0 ? Math.round((progressSummary.theoryCompleted / progressSummary.totalTopics) * 100) : 0}%)
                </span>
              </div>
            )}
            <div className="mt-3">
              <AnimatedProgressBar
                value={
                  progressSummary.overallCompletionPct > 0
                    ? progressSummary.overallCompletionPct
                    : progressSummary.totalTopics > 0
                    ? Math.round((progressSummary.theoryCompleted / progressSummary.totalTopics) * 100)
                    : 0
                }
                max={100}
                heightClass="h-1.5"
                customColor={progressSummary.overallCompletionPct > 0 ? '#6366f1' : '#3b82f6'}
                ariaLabel="Syllabus completion"
              />
            </div>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Due & Overdue Revisions</span>
              <RotateCcw className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber value={progressSummary.dueRevisionsCount} />
              </span>
              {progressSummary.overdueRevisionsCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 tabular-nums">
                  {progressSummary.overdueRevisionsCount} overdue
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--ff-text-muted)] mt-2">
              {progressSummary.overdueRevisionsCount > 0
                ? `${progressSummary.overdueRevisionsCount} review${progressSummary.overdueRevisionsCount === 1 ? '' : 's'} past scheduled retention window`
                : progressSummary.dueRevisionsCount > 0
                ? `${progressSummary.dueRevisionsCount} review${progressSummary.dueRevisionsCount === 1 ? '' : 's'} due for optimal retention today`
                : 'All scheduled spaced-repetition reviews up to date'}
            </p>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">High Severity Traps</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-rose-400">
                <AnimatedNumber value={progressSummary.highSeverityMistakesCount} />
              </span>
              <span className="text-xs text-[var(--ff-text-muted)] tabular-nums">
                of {progressSummary.unresolvedMistakesCount} unresolved
              </span>
            </div>
            <p className="text-[11px] text-[var(--ff-text-muted)] mt-2">
              Review Golden Rules before your next exam
            </p>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Deep Study Time</span>
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={Math.round((progressSummary.totalStudyMinutes / 60) * 10)}
                  format={(v) => `${(Math.round(v) / 10).toFixed(1)}h`}
                />
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
        </MotionStaggerItem>
      </MotionStaggerGrid>

      {/* Clean Single-Row Sub-Tab Bar (5 Core Tabs + More Tools & Labs Dropdown) */}
      {(() => {
        const primaryTabs: Array<{
          id: StudySubTab;
          label: string;
          icon: React.ComponentType<{ className?: string }>;
          badge?: number;
        }> = [
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'syllabus', label: 'Syllabus', icon: BookOpen },
          {
            id: 'revisions',
            label: 'Revisions',
            icon: RotateCcw,
            badge: progressSummary.dueRevisionsCount > 0 ? progressSummary.dueRevisionsCount : undefined,
          },
          { id: 'plans', label: 'Plans & Tasks', icon: Calendar },
          {
            id: 'mistakes',
            label: 'Mistakes',
            icon: AlertTriangle,
            badge: progressSummary.unresolvedMistakesCount > 0 ? progressSummary.unresolvedMistakesCount : undefined,
          },
        ];

        const secondaryTabGroups: Array<{
          title: string;
          items: Array<{
            id: StudySubTab;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
            badge?: number;
          }>;
        }> = [
          {
            title: 'Study Tools',
            items: [
              { id: 'goals', label: 'Academic Goals', icon: Target },
              { id: 'exams', label: 'Exams & Countdown', icon: Award },
              {
                id: 'flashcards',
                label: 'Flashcards',
                icon: Sparkles,
                badge: flashcards.filter((f) => !f.deletedAt && f.difficulty === 'hard').length || undefined,
              },
              { id: 'notes', label: 'Notes', icon: FileText },
              { id: 'resources', label: 'Resources', icon: Link2 },
              { id: 'quizzes', label: 'Quizzes', icon: HelpCircle },
              { id: 'habits', label: 'Academic Habits', icon: CheckSquare },
            ],
          },
          {
            title: 'Labs & Insights',
            items: [
              { id: 'microlab', label: 'COA / Math Lab', icon: Binary },
              { id: 'skilltree', label: 'Skill Tree', icon: GitBranch },
              { id: 'whiteboard', label: 'Rough Whiteboard', icon: PenTool },
              { id: 'simulator', label: 'Exam Simulator', icon: Clock },
              { id: 'analytics', label: 'Analytics & Mastery', icon: TrendingUp },
              { id: 'activity', label: 'Activity Log', icon: History },
            ],
          },
        ];

        const activeSecondary = secondaryTabGroups
          .flatMap((g) => g.items)
          .find((item) => item.id === activeSubTab);
        const ActiveSecondaryIcon = activeSecondary?.icon || Sparkles;

        return (
          <div className="relative flex items-center justify-between gap-2 border-b border-[var(--ff-border-color)] pb-2.5 min-w-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1">
              {primaryTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveSubTab(tab.id);
                      setMoreTabsOpen(false);
                    }}
                    className={`relative px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2 shrink-0 whitespace-nowrap ${
                      isActive
                        ? 'text-[var(--ff-text-primary)] bg-[var(--ff-surface-muted)] shadow-xs'
                        : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)]/40'
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
                        transition={profile.spring}
                        className="absolute bottom-0 left-2.5 right-2.5 h-0.5 bg-[var(--ff-accent)] rounded-full"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* More Tools & Labs Dropdown Pill (outside overflow-x-auto so popover never clips) */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setHeaderToolsOpen(false);
                    setMoreTabsOpen((o) => !o);
                  }}
                  aria-expanded={moreTabsOpen}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                    activeSecondary
                      ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)] font-semibold'
                      : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  <ActiveSecondaryIcon className="w-4 h-4 shrink-0" />
                  <span className="max-w-[110px] sm:max-w-none truncate">
                    {activeSecondary ? activeSecondary.label : 'More Labs'}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${moreTabsOpen ? 'rotate-180' : ''}`} />
                </button>

                {moreTabsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMoreTabsOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 top-full mt-2 w-[min(92vw,440px)] max-h-[70vh] overflow-y-auto rounded-2xl bg-[var(--ff-surface-elevated)] border border-[var(--ff-border-color)] shadow-2xl z-50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {secondaryTabGroups.map((group) => (
                        <div key={group.title} className="space-y-1">
                          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                            {group.title}
                          </div>
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            const isItemActive = activeSubTab === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setActiveSubTab(item.id);
                                  setMoreTabsOpen(false);
                                }}
                                className={`w-full px-2.5 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors text-left ${
                                  isItemActive
                                    ? 'bg-[var(--ff-accent)]/15 text-[var(--ff-accent-text)] font-semibold'
                                    : 'text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)]'
                                }`}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <ItemIcon className="w-3.5 h-3.5 shrink-0 opacity-85" />
                                  <span className="truncate">{item.label}</span>
                                </span>
                                {item.badge !== undefined && (
                                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500/20 text-rose-400 font-bold">
                                    {item.badge}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <ThemeButton variant="ghost" size="sm" onClick={() => void loadData()} title="Refresh study data">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </ThemeButton>
            </div>
          </div>
        );
      })()}

      {/* Stale Cache Notice */}
      {isStale && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Cached study records: Displaying saved study data while reconnecting.</span>
          </div>
          <ThemeButton variant="secondary" size="sm" onClick={() => void loadData()}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </ThemeButton>
        </div>
      )}

      {/* Network / Load Error Alert */}
      {loadError && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <ThemeButton variant="secondary" size="sm" onClick={() => void loadData()}>
            Retry
          </ThemeButton>
        </div>
      )}

      {/* SUB-VIEW 0: OVERVIEW & PROGRESS DASHBOARD */}
      {activeSubTab === 'overview' && (
        <StudyProgressDashboard
          subjects={subjects}
          topics={topics}
          focusSessions={focusSessions}
          syncState={syncState}
          isSyncing={isSyncingSheets}
          onSyncNow={handleManualSyncSheets}
          onSelectSubject={(code) => {
            setSelectedSubjectCode(code);
            setActiveSubTab('syllabus');
          }}
          selectedSubjectCode={selectedSubjectCode}
          onNavigateToSheetHub={() => setCurrentTab('sheet_hub')}
        />
      )}

      {/* SUB-VIEW 1: SYLLABUS & TOPICS */}
      {activeSubTab === 'syllabus' && (
        <div className="space-y-6">
          {/* Connected Google Sheets Sync Quick Bar */}
          {syncState?.status && syncState.status !== 'no_connection' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isSyncingSheets
                      ? 'bg-blue-400 animate-pulse'
                      : syncState.status === 'synced' || syncState.status === 'connected'
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                      : syncState.status === 'pending_changes'
                      ? 'bg-amber-400'
                      : syncState.status === 'read_only'
                      ? 'bg-sky-400'
                      : 'bg-zinc-400'
                  }`}
                />
                <span className="font-semibold text-[var(--ff-text-primary)]">
                  {syncState.connectedSheetTitle || 'Connected Spreadsheet'}
                </span>
                <span className="text-[var(--ff-text-muted)]">
                  • {syncState.status === 'synced'
                    ? syncState.lastSyncedAt
                      ? `Synced (${new Date(syncState.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                      : 'Connected & ready for two-way sync'
                    : syncState.status === 'pending_changes'
                    ? `${syncState.pendingCount} pending updates waiting to write back`
                    : syncState.status === 'read_only'
                    ? 'Connected in read-only mode'
                    : syncState.status === 'permission_required'
                    ? 'Reconnection required'
                    : syncState.status}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ThemeButton
                  variant="ghost"
                  size="sm"
                  loading={isSyncingSheets}
                  onClick={() => void handleManualSyncSheets()}
                  className="text-xs text-emerald-400 hover:bg-emerald-500/10"
                  title="Synchronize Google Sheets checkboxes"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  Sync Checkboxes
                </ThemeButton>
                <ThemeButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveSubTab('overview')}
                  className="text-xs text-[var(--ff-accent-text)]"
                >
                  Progress Dashboard <ArrowRight className="w-3 h-3 ml-1" />
                </ThemeButton>
              </div>
            </div>
          )}
          {/* Filters: Academic Tier + Subject Select + Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Academic Tiers */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedTier('all');
                  setSelectedSubjectCode('all');
                }}
                className={`relative px-3 py-1.5 text-xs rounded-xl font-medium transition-colors whitespace-nowrap border ${
                  selectedTier === 'all'
                    ? 'bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] border-[var(--ff-accent-border)] font-semibold shadow-xs'
                    : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-hover)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                <span>All Tiers</span>
              </button>
              {allTiers.map((tier) => {
                const active = selectedTier === tier.id;
                const isCustom = !DEFAULT_ACADEMIC_TIERS.some((d) => d.id === tier.id);
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => {
                      setSelectedTier(tier.id);
                      setSelectedSubjectCode('all');
                    }}
                    className={`group relative px-3 py-1.5 text-xs rounded-xl font-medium transition-colors whitespace-nowrap border flex items-center gap-1.5 ${
                      active
                        ? 'bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] border-[var(--ff-accent-border)] font-semibold shadow-xs'
                        : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-hover)] hover:text-[var(--ff-text-primary)]'
                    }`}
                  >
                    <span>{tier.shortTitle || tier.name}</span>
                    {isCustom && (
                      <span
                        role="button"
                        onClick={(e) => void handleDeleteTier(tier, e)}
                        title={`Delete tier "${tier.name}"`}
                        aria-label={`Delete tier ${tier.name}`}
                        className="p-0.5 rounded-full hover:bg-rose-500/20 text-rose-400 opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsAddTierOpen(true)}
                className="px-2.5 py-1.5 text-xs rounded-xl font-medium transition-colors whitespace-nowrap bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent-border)] hover:text-[var(--ff-accent-text)] flex items-center gap-1 shrink-0"
                title="Create a new academic tier"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Tier</span>
              </button>
            </div>

            {/* Subject Dropdown & Search */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
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
                {selectedSubjectCode !== 'all' && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddTopic(selectedSubjectCode)}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-[var(--ff-accent)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0 shadow-xs"
                    title={`Add topic to ${subjects.find((s) => s.code === selectedSubjectCode)?.name || selectedSubjectCode}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Topic</span>
                  </button>
                )}
                {selectedSubjectCode !== 'all' && (() => {
                  const currentSub = subjects.find((s) => s.code === selectedSubjectCode && !s.deletedAt);
                  if (!currentSub) return null;
                  const isDeleting = deletingSubjectId === (currentSub.id || currentSub.code);
                  return (
                    <button
                      type="button"
                      disabled={Boolean(deletingSubjectId)}
                      onClick={() => void handleDeleteSubject(currentSub)}
                      title={`Delete subject "${currentSub.name}" (${currentSub.code})`}
                      aria-label={`Delete selected subject ${currentSub.name}`}
                      className="p-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  );
                })()}
              </div>

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
            {visibleSubjects.length === 0 && (
              <div className="col-span-full p-8 text-center text-xs text-[var(--ff-text-muted)] border border-dashed border-[var(--ff-border-color)] rounded-2xl">
                No study subjects found. Click &quot;+ Add Subject&quot; above to create one.
              </div>
            )}
            {visibleSubjects.map((sub) => {
              const subTopics = activeTopics.filter((t) => t.subjectCode === sub.code);
              const fullyMastered = subTopics.filter((t) => t.theory && t.practice).length;
              const theoryCount = subTopics.filter((t) => t.theory).length;
              const pct = subTopics.length > 0
                ? fullyMastered > 0
                  ? Math.round((fullyMastered / subTopics.length) * 100)
                  : Math.round((theoryCount / subTopics.length) * 100)
                : 0;
              const isSelected = selectedSubjectCode === sub.code;

              return (
                <div
                  key={sub.code}
                  onClick={() => setSelectedSubjectCode(isSelected ? 'all' : sub.code)}
                  className={`group relative cursor-pointer p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-[var(--ff-surface-muted)] border-[var(--ff-accent)] ring-1 ring-[var(--ff-accent)]'
                      : 'bg-[var(--ff-surface-card)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color || '#6366f1' }}
                      />
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] whitespace-nowrap"
                        title={sub.code}
                      >
                        {sub.code.replace(/^sub_/i, '').toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddTopic(sub.code);
                        }}
                        title={`Add topic to "${sub.name}"`}
                        aria-label={`Add topic to ${sub.name}`}
                        className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] hover:bg-[var(--ff-accent)]/10 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {(() => {
                        const isDeleting = deletingSubjectId === (sub.id || sub.code);
                        return (
                          <button
                            type="button"
                            disabled={Boolean(deletingSubjectId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteSubject(sub);
                            }}
                            title={`Delete subject "${sub.name}" (${sub.code})`}
                            aria-label={`Delete subject ${sub.name}`}
                            className="p-1 -mr-1 rounded-lg text-[var(--ff-text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-60 hover:opacity-100 disabled:opacity-40"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-[var(--ff-text-primary)] truncate" title={sub.name}>
                    {sub.name}
                  </h3>
                  <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">
                    {sub.targetExam || sub.semesterOrDomain || 'Core Subject'}
                  </p>

                  <div className="mt-3 pt-2 border-t border-[var(--ff-border-color)]/60 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--ff-text-muted)]">
                      {fullyMastered > 0 ? `${pct}% mastered` : theoryCount > 0 ? `${pct}% theory done` : '0% done'}
                    </span>
                    <span className="font-medium text-[var(--ff-text-primary)]">
                      {fullyMastered > 0
                        ? `${fullyMastered}/${subTopics.length}`
                        : theoryCount > 0
                        ? `${theoryCount}/${subTopics.length} theory`
                        : `0/${subTopics.length}`}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--ff-surface-muted)] h-1 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: fullyMastered > 0 ? (sub.color || '#6366f1') : '#3b82f6',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenAddTopic(sub.code);
                    }}
                    className="w-full mt-2.5 py-1 px-2.5 rounded-xl border border-dashed border-[var(--ff-border-color)] hover:border-[var(--ff-accent)] bg-[var(--ff-surface-subtle)] hover:bg-[var(--ff-accent)]/10 text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{subTopics.length === 0 ? 'Add First Topic' : 'Add Topic'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Clean Collapsible Module Accordions & Slim Topic Checklist */}
          <ThemeCard className="overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--ff-border-color)] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <h2 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                  Syllabus Checklist
                </h2>
                <span className="text-xs font-mono tabular-nums text-[var(--ff-text-muted)]">
                  ({visibleTopics.length} topics • {groupedSyllabusModules.length} modules)
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="hidden md:flex items-center gap-2.5 text-[11px] text-[var(--ff-text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-blue-500" /> T: Theory
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-emerald-500" /> P: Practice
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-purple-500" /> Q: PYQ
                  </span>
                </div>

                {groupedSyllabusModules.length > 1 && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleToggleAllModules(true)}
                      className="px-2 py-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors"
                    >
                      Expand all
                    </button>
                    <span className="text-[var(--ff-border-color)]">/</span>
                    <button
                      type="button"
                      onClick={() => handleToggleAllModules(false)}
                      className="px-2 py-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors"
                    >
                      Collapse
                    </button>
                  </div>
                )}
              </div>
            </div>

            {visibleTopics.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-xs text-[var(--ff-text-muted)] flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--ff-surface-muted)] flex items-center justify-center text-[var(--ff-accent-text)]">
                  <BookOpen className="w-6 h-6" />
                </div>
                <p className="max-w-md text-sm text-[var(--ff-text-primary)] font-medium">
                  {selectedSubjectCode !== 'all' && subjects.find((s) => s.code === selectedSubjectCode)
                    ? `No topics in "${subjects.find((s) => s.code === selectedSubjectCode)?.name}" yet.`
                    : topics.length > 0
                    ? `No syllabus topics matching current filter (${topics.length} total across all subjects).`
                    : 'No syllabus topics added yet.'}
                </p>
                <ThemeButton
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenAddTopic(selectedSubjectCode !== 'all' ? selectedSubjectCode : undefined)}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Topic
                </ThemeButton>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ff-border-color)]">
                {groupedSyllabusModules.map((group, idx) => {
                  const isOpen = isModuleExpanded(group.key, idx);
                  const doneCount = group.masteredCount > 0 ? group.masteredCount : group.theoryCount;
                  const pct = group.topics.length > 0 ? Math.round((doneCount / group.topics.length) * 100) : 0;

                  return (
                    <div key={group.key} className="bg-[var(--ff-surface-card)]">
                      {/* Module Accordion Header */}
                      <button
                        type="button"
                        onClick={() => toggleModuleExpanded(group.key, idx)}
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[var(--ff-surface-muted)]/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ChevronRight
                            className={`w-4 h-4 text-[var(--ff-text-muted)] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90 text-[var(--ff-accent-text)]' : ''}`}
                          />
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: group.subjectColor }}
                          />
                          {selectedSubjectCode === 'all' && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] shrink-0">
                              {group.subjectName}
                            </span>
                          )}
                          <span className="text-xs sm:text-sm font-semibold text-[var(--ff-text-primary)] truncate">
                            {group.unit}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="hidden sm:flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-[var(--ff-surface-muted)] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: group.subjectColor }}
                              />
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-[var(--ff-text-muted)] w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                          <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]">
                            {doneCount}/{group.topics.length}
                          </span>
                        </div>
                      </button>

                      {/* Compact 1-Line Topic Rows */}
                      {isOpen && (
                        <div className="divide-y divide-[var(--ff-border-color)]/50 border-t border-[var(--ff-border-color)]/60 bg-[var(--ff-surface-subtle)]/30">
                          {group.topics.map((item) => {
                            const isFullyCompleted = item.theory && item.practice;
                            const priorityDot =
                              item.priority === 'High'
                                ? 'bg-rose-400'
                                : item.priority === 'Medium'
                                ? 'bg-amber-400'
                                : 'bg-blue-400';

                            return (
                              <div
                                key={item.id}
                                className="group/row px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--ff-surface-muted)]/50 transition-colors relative"
                              >
                                <SubtleConfetti show={celebratingTopicId === item.id} />
                                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTopicCompleted(item.id)}
                                    title={isFullyCompleted ? 'Mark incomplete' : 'Mark topic done'}
                                    className={`mt-0.5 sm:mt-0 shrink-0 transition-colors ${
                                      isFullyCompleted
                                        ? 'text-emerald-400'
                                        : 'text-[var(--ff-text-muted)] hover:text-emerald-400'
                                    }`}
                                  >
                                    {isFullyCompleted ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <Circle className="w-4 h-4" />
                                    )}
                                  </button>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot}`}
                                        title={`${item.priority} Priority`}
                                      />
                                      <span
                                        className={`text-xs sm:text-sm font-medium truncate ${
                                          isFullyCompleted
                                            ? 'line-through text-[var(--ff-text-muted)]'
                                            : 'text-[var(--ff-text-primary)]'
                                        }`}
                                      >
                                        {item.subtopic || item.topic}
                                      </span>
                                    </div>
                                    {item.notes && (
                                      <p className="text-[11px] text-[var(--ff-text-muted)] truncate mt-0.5 pl-3.5">
                                        {item.notes}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Compact T / P / Q Pills + Subtle Quick Actions */}
                                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                  <div className="flex items-center gap-1 bg-[var(--ff-surface-muted)] p-0.5 rounded-lg border border-[var(--ff-border-color)]">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTopicFlag(item.id, 'theory')}
                                      title="Theory"
                                      className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all flex items-center justify-center ${
                                        item.theory
                                          ? 'bg-blue-500 text-white'
                                          : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                                      }`}
                                    >
                                      T
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTopicFlag(item.id, 'practice')}
                                      title="Practice"
                                      className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all flex items-center justify-center ${
                                        item.practice
                                          ? 'bg-emerald-500 text-white'
                                          : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                                      }`}
                                    >
                                      P
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTopicFlag(item.id, 'pyq')}
                                      title="PYQ"
                                      className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all flex items-center justify-center ${
                                        item.pyq
                                          ? 'bg-purple-500 text-white'
                                          : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                                      }`}
                                    >
                                      Q
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-0.5 sm:opacity-60 sm:group-hover/row:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveTopicForRevision(item);
                                        setIsScheduleRevisionOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-amber-400 hover:bg-amber-500/10"
                                      title="Schedule Revision"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveStudySubjectCode(item.subjectCode);
                                        setActiveStudyTopicId(item.id);
                                        setActiveStudyActivityType('study');
                                        saveTimerState({
                                          activeStudySubjectCode: item.subjectCode,
                                          activeStudyTopicId: item.id,
                                          activeStudyActivityType: 'study',
                                        });
                                        if (timerMode !== 'work' && !isRunning) {
                                          switchTimerMode('work');
                                        }
                                        setCurrentTab('focus');
                                      }}
                                      className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-indigo-400 hover:bg-indigo-500/10"
                                      title="Start Focus Session"
                                    >
                                      <Timer className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTopicBookmark(item.id)}
                                      className={`p-1.5 rounded-lg ${
                                        item.isBookmarked ? 'text-amber-400' : 'text-[var(--ff-text-muted)] hover:text-amber-400'
                                      }`}
                                      title="Bookmark"
                                    >
                                      <Bookmark className="w-3.5 h-3.5" fill={item.isBookmarked ? 'currentColor' : 'none'} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTopic(item.id)}
                                      className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-rose-400 hover:bg-rose-500/10"
                                      title="Delete Topic"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
              {(['All', 'High', 'Medium', 'Low'] as const).map((sev) => {
                const active = mistakeSeverityFilter === sev;
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setMistakeSeverityFilter(sev)}
                    className={`relative px-3 py-1.5 text-xs rounded-xl font-medium transition-colors border ${
                      active
                        ? 'text-white border-transparent'
                        : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)] hover:text-[var(--ff-text-primary)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="study-severity-pill"
                        transition={profile.spring}
                        className="absolute inset-0 rounded-xl bg-[var(--ff-accent)] shadow-sm pointer-events-none"
                      />
                    )}
                    <span className="relative z-10">{sev} Severity</span>
                  </button>
                );
              })}
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
                const todayStr = getTodayDateString();
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

      {/* SUB-VIEW 6: STUDY PLANS & TASKS */}
      {activeSubTab === 'plans' && (
        <StudyPlansTab
          plans={plans}
          planTasks={planTasks}
          focusSessions={focusSessions}
          subjects={subjects}
          selectedDate={selectedCalendarDate}
          onSelectDate={setSelectedCalendarDate}
          onOpenAddPlan={() => setIsAddPlanOpen(true)}
          onToggleTask={handleToggleTaskStatus}
          onDeleteTask={handleDeletePlanTask}
          onDeletePlan={handleDeletePlan}
          onQuickAddTask={handleQuickAddTask}
        />
      )}

      {/* SUB-VIEW 7: ACADEMIC GOALS */}
      {activeSubTab === 'goals' && (
        <StudyGoalsTab
          goals={goals}
          subjects={subjects}
          onOpenAddGoal={() => setIsAddGoalOpen(true)}
          onToggleMilestone={handleToggleGoalMilestone}
          onDeleteGoal={handleDeleteGoal}
        />
      )}

      {/* SUB-VIEW 8: EXAMS & COUNTDOWN */}
      {activeSubTab === 'exams' && (
        <StudyExamsTab
          exams={exams}
          topics={topics}
          subjects={subjects}
          onOpenAddExam={() => setIsAddExamOpen(true)}
          onDeleteExam={handleDeleteExam}
        />
      )}

      {/* SUB-VIEW 9: ACTIVE RECALL FLASHCARDS */}
      {activeSubTab === 'flashcards' && (
        <StudyFlashcardsTab
          flashcards={isBookmarksOnly ? flashcards.filter((f) => f.isBookmarked) : flashcards}
          subjects={subjects}
          onOpenAddFlashcard={() => setIsAddFlashcardOpen(true)}
          onReviewFlashcard={handleReviewFlashcard}
          onToggleBookmark={handleToggleFlashcardBookmark}
          onDeleteFlashcard={handleDeleteFlashcard}
        />
      )}

      {/* SUB-VIEW 10: STUDY NOTES */}
      {activeSubTab === 'notes' && (
        <StudyNotesTab
          notes={isBookmarksOnly ? notes.filter((n) => n.isBookmarked) : notes}
          subjects={subjects}
          onOpenAddNote={() => setIsAddNoteOpen(true)}
          onTogglePin={handleToggleNotePin}
          onToggleBookmark={handleToggleNoteBookmark}
          onDeleteNote={handleDeleteNote}
        />
      )}

      {/* SUB-VIEW 11: RESOURCES & MATERIALS */}
      {activeSubTab === 'resources' && (
        <StudyResourcesTab
          resources={isBookmarksOnly ? resources.filter((r) => r.isBookmarked) : resources}
          subjects={subjects}
          onOpenAddResource={() => setIsAddResourceOpen(true)}
          onToggleBookmark={handleToggleResourceBookmark}
          onDeleteResource={handleDeleteResource}
        />
      )}

      {/* SUB-VIEW 12: QUIZZES */}
      {activeSubTab === 'quizzes' && (
        <StudyQuizzesTab
          quizzes={quizzes}
          onTakeQuiz={(quiz) => setSelectedQuizForAttempt(quiz)}
          onDeleteQuiz={handleDeleteQuiz}
        />
      )}

      {/* SUB-VIEW 13: ACTIVITY AUDIT TRAIL */}
      {activeSubTab === 'activity' && (
        <StudyActivityTab activityLogs={activityLogs} />
      )}

      {/* SUB-VIEW 14: COA & MATH MICRO-LAB */}
      {activeSubTab === 'microlab' && (
        <CoaMathMicroLab />
      )}

      {/* SUB-VIEW 15: RPG-STYLE SKILL TREE */}
      {activeSubTab === 'skilltree' && (
        <SkillTreeLab
          subjects={subjects}
          topics={activeTopics}
          onOpenInSyllabus={(subjectCode, unitOrQuery) => {
            setSelectedSubjectCode(subjectCode);
            setSearchQuery(unitOrQuery || '');
            setActiveSubTab('syllabus');
          }}
          onToggleTopicFlag={(topicId, flag) => {
            void handleToggleTopicFlag(topicId, flag);
          }}
          onToggleTopicCompleted={(topicId) => {
            void handleToggleTopicCompleted(topicId);
          }}
          onAddSubject={() => setIsAddSubjectOpen(true)}
          onAddTopic={(subCode) => handleOpenAddTopic(subCode)}
        />
      )}


      {/* SUB-VIEW 16: ROUGH-WORK WHITEBOARD CANVAS */}
      {activeSubTab === 'whiteboard' && (
        <WhiteboardCanvas topics={topics} />
      )}

      {/* SUB-VIEW 17: EXAM HALL SECTIONAL SIMULATOR */}
      {activeSubTab === 'simulator' && (
        <ExamHallSimulator />
      )}

      {/* MODALS */}
      <AddStudyTierModal
        isOpen={isAddTierOpen}
        onClose={() => setIsAddTierOpen(false)}
        onAdd={handleAddTier}
      />

      <AddStudySubjectModal
        isOpen={isAddSubjectOpen}
        onClose={() => setIsAddSubjectOpen(false)}
        tiers={allTiers}
        onOpenAddTier={() => {
          setIsAddSubjectOpen(false);
          setIsAddTierOpen(true);
        }}
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
        onClose={() => {
          setIsAddTopicOpen(false);
          setTargetSubjectCodeForTopic(undefined);
        }}
        subjects={subjects}
        defaultSubjectCode={targetSubjectCodeForTopic || (selectedSubjectCode !== 'all' ? selectedSubjectCode : undefined)}
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
          setSelectedSubjectCode(newTopic.subjectCode);
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
            lastStudiedAt: revisionData.lastStudiedAt || getTodayDateString(),
            nextRevisionAt: revisionData.nextRevisionAt!,
            intervalDays: revisionData.intervalDays || 1,
            repetition: 0,
            difficulty: revisionData.difficulty || 'medium',
            status: revisionData.status || 'scheduled',
            notes: revisionData.notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const saved = await api.saveStudyRevision(newRev);
          const finalRev = saved || newRev;
          setRevisions((prev) => [...prev, finalRev]);
          showToast(`Scheduled spaced revision for "${finalRev.topicTitle}"`, 'success');
          return finalRev;
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
            date: mistakeData.date || getTodayDateString(),
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

      <AddStudyGoalModal
        isOpen={isAddGoalOpen}
        onClose={() => setIsAddGoalOpen(false)}
        subjects={subjects}
        onAdd={handleCreateGoal}
      />

      <AddStudyPlanModal
        isOpen={isAddPlanOpen}
        onClose={() => setIsAddPlanOpen(false)}
        subjects={subjects}
        onAdd={handleCreatePlan}
      />

      <AddStudyExamModal
        isOpen={isAddExamOpen}
        onClose={() => setIsAddExamOpen(false)}
        subjects={subjects}
        topics={topics}
        onAdd={handleCreateExam}
      />

      <AddStudyNoteModal
        isOpen={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        subjects={subjects}
        topics={topics}
        onAdd={handleCreateNote}
      />

      <AddStudyResourceModal
        isOpen={isAddResourceOpen}
        onClose={() => setIsAddResourceOpen(false)}
        subjects={subjects}
        topics={topics}
        onAdd={handleCreateResource}
      />

      <AddStudyFlashcardModal
        isOpen={isAddFlashcardOpen}
        onClose={() => setIsAddFlashcardOpen(false)}
        subjects={subjects}
        topics={topics}
        onAdd={handleCreateFlashcard}
      />

      <TakeStudyQuizModal
        quiz={selectedQuizForAttempt}
        isOpen={!!selectedQuizForAttempt}
        onClose={() => setSelectedQuizForAttempt(null)}
        onRecordAttempt={handleRecordQuizAttempt}
      />

      <ExportRestoreStudyModal
        isOpen={isExportRestoreOpen}
        onClose={() => setIsExportRestoreOpen(false)}
        exportData={handleExportWorkspace}
        onRestore={handleRestoreWorkspace}
      />

      <SmartSyllabusTaskModal
        isOpen={isSmartSyllabusModalOpen}
        onClose={() => setIsSmartSyllabusModalOpen(false)}
        subjects={subjects}
        topics={topics}
        tasks={clientDataCache.getTasks() || []}
        defaultSubjectCode={selectedSubjectCode !== 'all' ? selectedSubjectCode : undefined}
        onSuccess={() => {
          void loadData();
          triggerRefresh();
        }}
      />
    </div>
  );
};
