/**
 * FocusFlow & Finance — Study Leaderboard View (Phase 1)
 *
 * Features:
 * - Private Study Squads (Create / Join via 6-character invite code, Copy Code, Leave)
 * - Global Opt-In Leaderboard (real-time Firestore onSnapshot)
 * - Top-3 Podium Cards + Ranked Table (Focus Hours, Goal Progress, Streak Badge)
 * - Privacy & Profile Settings (Custom Nickname, Avatar Color, Global Opt-In toggle)
 * - 100% Deterministic, Zero-AI, Zero Finance Exposure
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Trophy,
  Users,
  Globe,
  Flame,
  Plus,
  LogIn,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Crown,
  Settings,
  LogOut,
  Clock,
  Target,
  BookOpen,
  TrendingUp,
  Radio,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { DEFAULT_TIMEZONE } from '../../lib/dateTime.ts';
import type { FocusSession } from '../../types/index.ts';
import type {
  LeaderboardPeriod,
  LeaderboardProfile,
  StudySquad,
} from '../../types/leaderboard.ts';
import {
  LEADERBOARD_AVATAR_COLORS,
  computeSquadChallengeProgress,
  createStudySquad,
  extractAvailableSubjects,
  fetchSquadMemberProfiles,
  formatFocusMinutesShort,
  getLeaderboardProfile,
  joinStudySquadByCode,
  leaveStudySquad,
  listUserSquads,
  rankLeaderboardProfiles,
  subscribeGlobalLeaderboard,
  subscribeSquadMemberProfiles,
  syncUserLeaderboardStats,
  updateLeaderboardProfileSettings,
  updateSquadChallenge,
} from '../../lib/leaderboardService.ts';
import {
  ThemeCard,
  ThemeButton,
  ThemeBadge,
  ThemeInput,
  ThemeModal,
} from '../ui/ThemePrimitives.tsx';

interface StudyLeaderboardViewProps {
  focusSessions?: FocusSession[];
}

export const StudyLeaderboardView: React.FC<StudyLeaderboardViewProps> = ({ focusSessions: focusSessionsProp }) => {
  const { user, firebaseUser, settings, signInWithGoogle, showToast, refreshKey } = useApp();
  const activeUid = firebaseUser?.uid || null;
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;
  const dailyGoalMinutes = settings?.dailyFocusGoalMinutes || 120;
  const [loadedSessions, setLoadedSessions] = useState<FocusSession[]>(focusSessionsProp || []);

  useEffect(() => {
    if (focusSessionsProp) {
      setLoadedSessions(focusSessionsProp);
      return;
    }
    let cancelled = false;
    api
      .getFocusSessions()
      .then((list) => {
        if (!cancelled) setLoadedSessions(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [focusSessionsProp, refreshKey, activeUid]);

  const focusSessions = focusSessionsProp ?? loadedSessions;

  const [scope, setScope] = useState<'squads' | 'global'>('squads');
  const [period, setPeriod] = useState<LeaderboardPeriod>('today');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [myProfile, setMyProfile] = useState<LeaderboardProfile | null>(null);
  const [squads, setSquads] = useState<StudySquad[]>([]);
  const [activeSquadId, setActiveSquadId] = useState<string | null>(null);
  const [squadMembers, setSquadMembers] = useState<LeaderboardProfile[]>([]);
  const [globalProfiles, setGlobalProfiles] = useState<LeaderboardProfile[]>([]);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);

  // Forms & Filters
  const [newSquadName, setNewSquadName] = useState('');
  const [newSquadDesc, setNewSquadDesc] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState(user?.name || 'Focus Student');
  const [avatarColorInput, setAvatarColorInput] = useState(LEADERBOARD_AVATAR_COLORS[0]);
  const [isPublicInput, setIsPublicInput] = useState(false);
  const [challengeHoursInput, setChallengeHoursInput] = useState('50');
  const [challengeTitleInput, setChallengeTitleInput] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [submitting, setSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const loadLeaderboardData = useCallback(async () => {
    if (!activeUid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profile, userSquads] = await Promise.all([
        getLeaderboardProfile(activeUid),
        listUserSquads(activeUid),
      ]);

      setMyProfile(profile);
      if (profile) {
        setNicknameInput(profile.displayName);
        setAvatarColorInput(profile.avatarColor);
        setIsPublicInput(profile.isPublic);
      } else if (user?.name) {
        setNicknameInput(user.name);
      }

      setSquads(userSquads);
      if (userSquads.length > 0) {
        setActiveSquadId((prev) =>
          prev && userSquads.some((s) => s.id === prev) ? prev : userSquads[0].id
        );
      } else {
        setActiveSquadId(null);
        setSquadMembers([]);
      }
    } catch (err) {
      console.warn('[StudyLeaderboard] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeUid, user?.name]);

  useEffect(() => {
    void loadLeaderboardData();
  }, [loadLeaderboardData]);

  // Load members when active squad changes
  const activeSquad = useMemo(
    () => squads.find((s) => s.id === activeSquadId) || null,
    [squads, activeSquadId]
  );

  // Periodic 60s ticker so live elapsed minutes & 5-min stale timeout stay fresh
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Real-time listener for active Study Squad members (live presence + instant score updates)
  useEffect(() => {
    if (!activeSquad || !activeUid) {
      setSquadMembers([]);
      return;
    }
    const unsub = subscribeSquadMemberProfiles(
      activeSquad.memberUids,
      (list) => setSquadMembers(list),
      (err) => {
        console.warn('[StudyLeaderboard] Squad snapshot fallback:', err);
        void fetchSquadMemberProfiles(activeSquad.memberUids)
          .then((list) => setSquadMembers(list))
          .catch(() => {});
      }
    );
    return () => unsub();
  }, [activeSquad, activeUid]);

  // Real-time Global Opt-In Leaderboard listener
  useEffect(() => {
    if (!activeUid || scope !== 'global') return;
    const unsub = subscribeGlobalLeaderboard(
      (profiles) => setGlobalProfiles(profiles),
      (err) => console.warn('[StudyLeaderboard] Global snapshot error:', err)
    );
    return () => unsub();
  }, [activeUid, scope]);

  const handleSyncMyStats = async () => {
    if (!activeUid || syncing) return;
    setSyncing(true);
    try {
      const updated = await syncUserLeaderboardStats({
        uid: activeUid,
        displayName: nicknameInput || user?.name || 'Focus Student',
        avatarColor: avatarColorInput,
        isPublic: myProfile?.isPublic ?? false,
        dailyGoalMinutes,
        sessions: focusSessions,
        timezone,
        onlyIfExists: false,
      });
      if (updated) {
        setMyProfile(updated);
        if (activeSquad) {
          const refreshed = await fetchSquadMemberProfiles(activeSquad.memberUids);
          setSquadMembers(refreshed);
        }
        showToast('Study hours synced to Leaderboard!', 'success');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to sync stats.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateSquad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUid || !newSquadName.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await createStudySquad({
        uid: activeUid,
        name: newSquadName,
        description: newSquadDesc,
        displayName: nicknameInput || user?.name || 'Focus Student',
        sessions: focusSessions,
        timezone,
      });
      setSquads((prev) => [created, ...prev]);
      setActiveSquadId(created.id);
      setScope('squads');
      setCreateModalOpen(false);
      setNewSquadName('');
      setNewSquadDesc('');
      await loadLeaderboardData();
      showToast(`Squad "${created.name}" created! Invite Code: ${created.inviteCode}`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not create squad.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinSquad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUid || !joinCodeInput.trim() || submitting) return;
    setSubmitting(true);
    try {
      const joined = await joinStudySquadByCode({
        uid: activeUid,
        inviteCode: joinCodeInput,
        displayName: nicknameInput || user?.name || 'Focus Student',
        sessions: focusSessions,
        timezone,
      });
      setJoinModalOpen(false);
      setJoinCodeInput('');
      setScope('squads');
      setActiveSquadId(joined.id);
      await loadLeaderboardData();
      showToast(`Joined squad "${joined.name}"!`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not join squad.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveSquad = async (squad: StudySquad) => {
    if (!activeUid) return;
    if (!window.confirm(`Leave squad "${squad.name}"?`)) return;
    try {
      await leaveStudySquad(activeUid, squad.id);
      await loadLeaderboardData();
      showToast(`Left "${squad.name}".`, 'info');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to leave squad.', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUid || !nicknameInput.trim() || submitting) return;
    setSubmitting(true);
    try {
      const updated = await updateLeaderboardProfileSettings({
        uid: activeUid,
        displayName: nicknameInput,
        avatarColor: avatarColorInput,
        isPublic: isPublicInput,
        dailyGoalMinutes,
        sessions: focusSessions,
        timezone,
      });
      if (updated) setMyProfile(updated);
      setProfileModalOpen(false);
      if (activeSquad) {
        const refreshed = await fetchSquadMemberProfiles(activeSquad.memberUids);
        setSquadMembers(refreshed);
      }
      showToast(
        isPublicInput
          ? 'Profile saved & opted into Global Leaderboard!'
          : 'Profile saved (Private — visible only to your squads).',
        'success'
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save profile.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyInvite = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
      setCopiedCode(code);
      showToast(`Invite code ${code} copied!`, 'success');
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const handleOpenChallengeModal = () => {
    if (!activeSquad) return;
    setChallengeHoursInput(String(activeSquad.weeklyGoalHours || 50));
    setChallengeTitleInput(activeSquad.challengeTitle || '');
    setChallengeModalOpen(true);
  };

  const handleSaveChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSquad || submitting) return;
    setSubmitting(true);
    try {
      const parsedHours = Math.max(0, Math.min(2000, Math.round(Number(challengeHoursInput) || 0)));
      const res = await updateSquadChallenge({
        squadId: activeSquad.id,
        weeklyGoalHours: parsedHours,
        challengeTitle: challengeTitleInput,
      });
      setSquads((prev) =>
        prev.map((sq) =>
          sq.id === activeSquad.id
            ? { ...sq, weeklyGoalHours: res.weeklyGoalHours, challengeTitle: res.challengeTitle }
            : sq
        )
      );
      setChallengeModalOpen(false);
      showToast(
        res.weeklyGoalHours > 0
          ? `Weekly Squad Challenge set to ${res.weeklyGoalHours}h!`
          : 'Weekly Squad Challenge cleared.',
        'success'
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to update challenge.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sourceProfiles = scope === 'squads' ? squadMembers : globalProfiles;

  const availableSubjects = useMemo(
    () =>
      extractAvailableSubjects({
        profiles: sourceProfiles,
        period,
        timezone,
        now: new Date(nowTick),
      }),
    [sourceProfiles, period, timezone, nowTick]
  );

  const effectiveSubjectFilter =
    subjectFilter === 'ALL' || availableSubjects.some((s) => s.code === subjectFilter)
      ? subjectFilter
      : 'ALL';

  const rankedEntries = useMemo(() => {
    return rankLeaderboardProfiles({
      profiles: sourceProfiles,
      period,
      currentUid: activeUid,
      timezone,
      now: new Date(nowTick),
      subjectFilter: effectiveSubjectFilter,
    });
  }, [sourceProfiles, period, activeUid, timezone, nowTick, effectiveSubjectFilter]);

  const topThree = rankedEntries.slice(0, 3);
  const liveStudyingEntries = useMemo(
    () => rankedEntries.filter((e) => e.isStudyingLive),
    [rankedEntries]
  );
  const liveStudyingCount = liveStudyingEntries.length;
  const myRankEntry = useMemo(
    () => rankedEntries.find((e) => e.isCurrentUser) || null,
    [rankedEntries]
  );
  const aheadEntry = useMemo(() => {
    if (!myRankEntry || myRankEntry.rank <= 1) return null;
    return rankedEntries[myRankEntry.rank - 2] || null;
  }, [myRankEntry, rankedEntries]);
  const minutesBehindAhead = aheadEntry && myRankEntry
    ? Math.max(0, aheadEntry.minutes - myRankEntry.minutes)
    : 0;
  const challengeProgress = useMemo(
    () =>
      scope === 'squads' && activeSquad
        ? computeSquadChallengeProgress({
            squad: activeSquad,
            memberProfiles: squadMembers,
            timezone,
            now: new Date(nowTick),
          })
        : null,
    [scope, activeSquad, squadMembers, timezone, nowTick]
  );

  // Guest / Signed-out gate
  if (!activeUid) {
    return (
      <ThemeCard className="p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
          <Trophy className="w-7 h-7" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
            Sign in to Join Study Squads &amp; Leaderboards
          </h3>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Compare verified Pomodoro study hours with friends in private invite-code squads or opt into the global leaderboard. Your finance, tasks, and notes always stay 100% private.
          </p>
        </div>
        <ThemeButton variant="primary" size="sm" onClick={() => void signInWithGoogle()}>
          Sign in with Google
        </ThemeButton>
      </ThemeCard>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <Trophy className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">Study Leaderboard</h2>
            <ThemeBadge tone="success">Verified Pomodoro Hours</ThemeBadge>
            <ThemeBadge tone="neutral">16h/day Anti-Cheat Cap</ThemeBadge>
            {liveStudyingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {liveStudyingCount} Studying Now
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Track daily, weekly, and monthly focus hours with your study squad or global peers. Zero finance or private data is ever shared.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => void handleSyncMyStats()}
            disabled={syncing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-500 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync My Hours</span>
          </ThemeButton>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setProfileModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Privacy &amp; Name</span>
          </ThemeButton>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setJoinModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5 text-blue-400" />
            <span>Join Squad</span>
          </ThemeButton>

          <ThemeButton
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Squad</span>
          </ThemeButton>
        </div>
      </div>

      {/* Scope & Period Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border-color)] w-fit">
          <button
            type="button"
            onClick={() => setScope('squads')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              scope === 'squads'
                ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>My Squads ({squads.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setScope('global')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              scope === 'global'
                ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Global Opt-In</span>
          </button>
        </div>

        <div className="flex items-center gap-1 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border-color)] w-fit">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                period === p.id
                  ? 'bg-[var(--ff-surface-card)] text-[var(--ff-text-primary)] shadow-xs'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Squad Selector Strip (when in Squads mode) */}
      {scope === 'squads' && squads.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="flex flex-wrap items-center gap-2">
            {squads.map((sq) => (
              <button
                key={sq.id}
                type="button"
                onClick={() => setActiveSquadId(sq.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  activeSquadId === sq.id
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                {sq.name} ({sq.memberUids.length})
              </button>
            ))}
          </div>

          {activeSquad && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--ff-text-muted)]">Invite Code:</span>
              <button
                type="button"
                onClick={() => handleCopyInvite(activeSquad.inviteCode)}
                className="px-2.5 py-1 rounded-lg font-mono font-bold bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent)] flex items-center gap-1.5"
                title="Copy invite code to share with friends"
              >
                <span>{activeSquad.inviteCode}</span>
                {copiedCode === activeSquad.inviteCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleLeaveSquad(activeSquad)}
                className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-rose-400 hover:bg-rose-500/10"
                title="Leave squad"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Phase 3: Weekly Squad Challenge Banner */}
      {scope === 'squads' && activeSquad && (
        challengeProgress ? (
          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-accent)]/35 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1.5 rounded-lg bg-[var(--ff-accent)]/15 text-[var(--ff-accent-text)] shrink-0">
                  <Target className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                    {activeSquad.challengeTitle || 'Weekly Squad Challenge'}
                  </div>
                  <div className="text-[11px] text-[var(--ff-text-muted)]">
                    {challengeProgress.isCompleted
                      ? 'Weekly squad target achieved!'
                      : `${challengeProgress.remainingHoursFormatted} remaining this week`}
                    {challengeProgress.topContributorName
                      ? ` • Top: ${challengeProgress.topContributorName} (${formatFocusMinutesShort(challengeProgress.topContributorMinutes)})`
                      : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs font-bold text-[var(--ff-text-primary)]">
                  {challengeProgress.completedHoursFormatted} / {challengeProgress.goalHours}h
                </span>
                <ThemeBadge tone={challengeProgress.isCompleted ? 'success' : 'neutral'}>
                  {challengeProgress.progressPct}%
                </ThemeBadge>
                {activeSquad.ownerUid === activeUid && (
                  <ThemeButton variant="ghost" size="sm" onClick={handleOpenChallengeModal}>
                    Edit Goal
                  </ThemeButton>
                )}
              </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[var(--ff-surface-muted)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  challengeProgress.isCompleted
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-[var(--ff-accent)] to-emerald-400'
                }`}
                style={{ width: `${challengeProgress.progressPct}%` }}
              />
            </div>
          </div>
        ) : activeSquad.ownerUid === activeUid ? (
          <div className="px-4 py-2.5 rounded-xl border border-dashed border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--ff-text-muted)] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
              Set a combined weekly study-hour goal for <strong>{activeSquad.name}</strong>.
            </span>
            <ThemeButton variant="secondary" size="sm" onClick={handleOpenChallengeModal}>
              Set Weekly Challenge
            </ThemeButton>
          </div>
        ) : null
      )}

      {/* Global Opt-In Prompt if user hasn't opted in yet */}
      {scope === 'global' && !myProfile?.isPublic && (
        <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-blue-300">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              You are currently hidden from the Global Leaderboard. Opt in anytime with a custom nickname.
            </span>
          </div>
          <ThemeButton variant="primary" size="sm" onClick={() => setProfileModalOpen(true)}>
            Opt In to Global
          </ThemeButton>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <ThemeCard className="p-10 text-center text-xs text-[var(--ff-text-muted)]">
          Loading leaderboard rankings...
        </ThemeCard>
      ) : scope === 'squads' && squads.length === 0 ? (
        <ThemeCard className="p-10 text-center space-y-3 border-dashed">
          <div className="w-12 h-12 rounded-2xl bg-[var(--ff-surface-muted)] mx-auto flex items-center justify-center text-amber-400">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
            No Study Squads Yet
          </h3>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-md mx-auto">
            Create a private squad and share the 6-character invite code with your classmates, or join an existing squad to see who studies the most hours.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <ThemeButton variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Create Squad
            </ThemeButton>
            <ThemeButton variant="secondary" size="sm" onClick={() => setJoinModalOpen(true)}>
              <LogIn className="w-3.5 h-3.5 mr-1" /> Join with Code
            </ThemeButton>
          </div>
        </ThemeCard>
      ) : (
        <>
          {/* Phase 3: Subject-Specific Leaderboard Filter Pills */}
          {availableSubjects.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ff-text-muted)] mr-1">
                <BookOpen className="w-3.5 h-3.5" />
                Subject:
              </span>
              <button
                type="button"
                onClick={() => setSubjectFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                  effectiveSubjectFilter === 'ALL'
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)] text-white'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                All Subjects
              </button>
              {availableSubjects.map((sub) => (
                <button
                  key={sub.code}
                  type="button"
                  onClick={() => setSubjectFilter(sub.code)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                    effectiveSubjectFilter === sub.code
                      ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)] text-white'
                      : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  {sub.code}{' '}
                  <span className="opacity-75 font-mono">
                    ({formatFocusMinutesShort(sub.totalMinutes)})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Calm Bento / Linear: Live Studying Now Strip */}
          {liveStudyingEntries.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-[var(--ff-surface-card)] border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 shrink-0">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Studying Live ({liveStudyingEntries.length})</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                {liveStudyingEntries.map((entry) => (
                  <div
                    key={`live-chip-${entry.uid}`}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[11px] shrink-0"
                  >
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: entry.avatarColor }}
                    >
                      {entry.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="font-semibold text-[var(--ff-text-primary)] max-w-[110px] truncate">
                      {entry.displayName}
                    </span>
                    <span className="text-[var(--ff-text-muted)]">•</span>
                    <span className="text-emerald-400 font-medium max-w-[110px] truncate">
                      {entry.activeSubject || 'Deep Focus'}
                    </span>
                    <span className="font-mono tabular-nums text-[10px] text-[var(--ff-text-muted)]">
                      {entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calm Bento / Linear: True Olympic Podium (#2 — #1 Center Elevated — #3) */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end pt-1">
              {topThree.map((entry) => {
                const isFirst = entry.rank === 1;
                const isSecond = entry.rank === 2;
                // Mobile: #1 -> #2 -> #3; Desktop: #2 (left) — #1 (elevated center) — #3 (right)
                const orderClass = isFirst
                  ? 'order-1 sm:order-2 sm:-mt-3'
                  : isSecond
                  ? 'order-2 sm:order-1'
                  : 'order-3 sm:order-3';
                const cardSurface = isFirst
                  ? 'border-amber-500/45 bg-[var(--ff-surface-card)] shadow-sm'
                  : isSecond
                  ? 'border-slate-400/35 bg-[var(--ff-surface-card)]'
                  : 'border-orange-500/35 bg-[var(--ff-surface-card)]';
                const rankPillClass = isFirst
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : isSecond
                  ? 'bg-slate-400/15 text-slate-300 border-slate-400/30'
                  : 'bg-orange-500/15 text-orange-400 border-orange-500/30';

                return (
                  <div
                    key={entry.uid}
                    className={`relative overflow-hidden rounded-2xl border ${cardSurface} ${orderClass} ${isFirst ? 'p-5' : 'p-4'} flex flex-col justify-between gap-3.5 transition-colors`}
                  >
                    {isFirst && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-amber-500/10 to-transparent"
                      />
                    )}

                    <div className="relative flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-bold font-mono tabular-nums ${rankPillClass}`}
                      >
                        <Crown className="w-3.5 h-3.5" />
                        #{entry.rank}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-[var(--ff-text-muted)]">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        {entry.streakDays}d
                      </span>
                    </div>

                    <div className="relative flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`${isFirst ? 'w-11 h-11 text-base' : 'w-9 h-9 text-sm'} rounded-xl flex items-center justify-center text-white font-bold shadow-xs`}
                          style={{ backgroundColor: entry.avatarColor }}
                        >
                          {entry.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        {entry.isStudyingLive && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[var(--ff-surface-card)] animate-pulse"
                            title="Studying live right now"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                          {entry.displayName}
                          {entry.isCurrentUser && (
                            <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ff-accent)]/15 text-[var(--ff-accent-text)]">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--ff-surface-muted)] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isFirst ? 'bg-amber-400' : 'bg-[var(--ff-accent)]'}`}
                              style={{ width: `${entry.goalProgressPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono tabular-nums text-[var(--ff-text-muted)] shrink-0">
                            {entry.goalProgressPct}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {entry.isStudyingLive && (
                      <div className="relative inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-semibold text-emerald-400 w-fit max-w-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <span className="truncate">
                          LIVE • {entry.activeSubject || 'Deep Focus'} •{' '}
                          {entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'}
                        </span>
                      </div>
                    )}

                    <div className="relative flex items-baseline justify-between pt-2.5 border-t border-[var(--ff-border-color)]/70">
                      <span className="text-[10px] font-semibold tracking-wider text-[var(--ff-text-muted)] uppercase">
                        {effectiveSubjectFilter !== 'ALL'
                          ? effectiveSubjectFilter
                          : period === 'today'
                          ? 'Today'
                          : period === 'week'
                          ? 'This Week'
                          : 'This Month'}
                      </span>
                      <span
                        className={`${isFirst ? 'text-2xl' : 'text-lg'} font-extrabold font-mono tabular-nums text-[var(--ff-text-primary)] tracking-tight`}
                      >
                        {entry.hoursFormatted}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Calm Bento / Linear: Pinned "Your Standing" Summary Bar */}
          {myRankEntry && (
            <div className="px-4 py-3 rounded-2xl border border-[var(--ff-accent)]/35 bg-[var(--ff-accent)]/5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <span className="px-2.5 py-1 rounded-lg bg-[var(--ff-accent)] text-white font-mono tabular-nums font-bold text-xs shrink-0">
                  #{myRankEntry.rank}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--ff-text-primary)] truncate">
                    Your Standing{' '}
                    <span className="text-[var(--ff-text-muted)] font-normal">
                      • Rank {myRankEntry.rank} of {rankedEntries.length}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-1.5 mt-0.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[var(--ff-accent-text)] shrink-0" />
                    {myRankEntry.rank === 1 ? (
                      <span className="text-emerald-400 font-medium">
                        You&apos;re leading the board!
                      </span>
                    ) : aheadEntry ? (
                      <span>
                        <strong className="font-mono tabular-nums text-[var(--ff-text-primary)]">
                          {minutesBehindAhead > 0 ? formatFocusMinutesShort(minutesBehindAhead) : 'Tied'}
                        </strong>{' '}
                        {minutesBehindAhead > 0 ? 'behind' : 'with'} #{aheadEntry.rank} ({aheadEntry.displayName})
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-amber-400">
                  <Flame className="w-3.5 h-3.5" />
                  {myRankEntry.streakDays}d
                </span>
                <span className="font-mono tabular-nums font-extrabold text-base text-[var(--ff-text-primary)]">
                  {myRankEntry.hoursFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Calm Bento / Linear: Full Ranked Table */}
          <ThemeCard className="overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--ff-border-color)] flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--ff-text-primary)]">
                {scope === 'squads' && activeSquad
                  ? `${activeSquad.name} — Rankings (${rankedEntries.length})`
                  : `Global Opt-In Rankings (${rankedEntries.length})`}
                {effectiveSubjectFilter !== 'ALL' ? ` • ${effectiveSubjectFilter}` : ''}
              </span>
              <span className="text-[var(--ff-text-muted)] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Resets midnight ({timezone})
              </span>
            </div>

            {rankedEntries.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
                No rankings yet. Click <strong>Sync My Hours</strong> or complete a Pomodoro session to appear here.
              </div>
            ) : (
              <div className="divide-y divide-[var(--ff-border-color)]/70">
                {rankedEntries.map((entry) => {
                  const rankBadgeStyle =
                    entry.rank === 1
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : entry.rank === 2
                      ? 'bg-slate-400/15 text-slate-300 border-slate-400/30'
                      : entry.rank === 3
                      ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                      : 'bg-transparent text-[var(--ff-text-muted)] border-transparent';

                  return (
                    <div
                      key={entry.uid}
                      className={`px-4 py-3 flex items-center justify-between gap-3 text-xs transition-colors ${
                        entry.isCurrentUser
                          ? 'bg-[var(--ff-accent)]/10'
                          : 'hover:bg-[var(--ff-surface-muted)]/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-8 py-0.5 rounded-md border text-center font-mono tabular-nums font-bold text-[11px] shrink-0 ${rankBadgeStyle}`}
                        >
                          #{entry.rank}
                        </span>
                        <div className="relative shrink-0">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: entry.avatarColor }}
                          >
                            {entry.displayName.slice(0, 1).toUpperCase()}
                          </div>
                          {entry.isStudyingLive && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[var(--ff-surface-card)] animate-pulse"
                              title="Studying live right now"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                              {entry.displayName}
                            </span>
                            {entry.isCurrentUser && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--ff-accent)]/15 text-[var(--ff-accent-text)]">
                                You
                              </span>
                            )}
                            {entry.isStudyingLive && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-semibold text-emerald-400 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                LIVE • {entry.activeSubject || 'Deep Focus'} •{' '}
                                {entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-28 sm:w-40 bg-[var(--ff-surface-muted)] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[var(--ff-accent)]"
                                style={{ width: `${entry.goalProgressPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono tabular-nums text-[var(--ff-text-muted)]">
                              {entry.goalProgressPct}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <span className="hidden sm:inline-flex items-center gap-1 font-mono tabular-nums text-amber-400">
                          <Flame className="w-3.5 h-3.5" />
                          {entry.streakDays}d
                        </span>
                        <span className="font-mono tabular-nums font-bold text-sm text-[var(--ff-text-primary)] min-w-[52px] text-right">
                          {entry.hoursFormatted}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ThemeCard>
        </>
      )}

      {/* CREATE SQUAD MODAL */}
      <ThemeModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Private Study Squad"
        subtitle="Generate a 6-character invite code for your study group"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleCreateSquad} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-primary)] mb-1">
              Squad Name *
            </label>
            <ThemeInput
              value={newSquadName}
              onChange={(e) => setNewSquadName(e.target.value)}
              placeholder="e.g. Sem 3 CSE Squad, GATE 2027 Grinders"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-primary)] mb-1">
              Description (Optional)
            </label>
            <ThemeInput
              value={newSquadDesc}
              onChange={(e) => setNewSquadDesc(e.target.value)}
              placeholder="Daily 4h target before finals"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="ghost" size="sm" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" loading={submitting}>
              Create Squad
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* JOIN SQUAD MODAL */}
      <ThemeModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        title="Join Study Squad"
        subtitle="Enter the 6-character invite code shared by your friend"
        maxWidthClass="max-w-sm"
      >
        <form onSubmit={handleJoinSquad} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-primary)] mb-1">
              Invite Code *
            </label>
            <ThemeInput
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. CSE3A9"
              maxLength={6}
              className="font-mono uppercase tracking-widest text-center text-base"
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="ghost" size="sm" onClick={() => setJoinModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" loading={submitting}>
              Join Squad
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* PRIVACY & PROFILE SETTINGS MODAL */}
      <ThemeModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Leaderboard Profile & Privacy"
        subtitle="Control your display nickname and global visibility"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-primary)] mb-1">
              Display Nickname *
            </label>
            <ThemeInput
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="e.g. NightOwl_Atif"
              maxLength={48}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-primary)] mb-1.5">
              Avatar Badge Color
            </label>
            <div className="flex items-center gap-2">
              {LEADERBOARD_AVATAR_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setAvatarColorInput(hex)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    avatarColorInput === hex ? 'scale-125 ring-2 ring-offset-1 ring-[var(--ff-accent)]' : ''
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublicInput}
              onChange={(e) => setIsPublicInput(e.target.checked)}
              className="mt-0.5 rounded accent-[var(--ff-accent)]"
            />
            <div className="text-xs">
              <strong className="text-[var(--ff-text-primary)] block">
                Appear on Global Opt-In Leaderboard
              </strong>
              <span className="text-[var(--ff-text-muted)]">
                Only your nickname, focus hours, and streak are shared. Finance, tasks, and notes are never visible.
              </span>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="ghost" size="sm" onClick={() => setProfileModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" loading={submitting}>
              Save Profile
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* WEEKLY SQUAD CHALLENGE MODAL (Owner-Only) */}
      <ThemeModal
        isOpen={challengeModalOpen}
        onClose={() => setChallengeModalOpen(false)}
        title="Weekly Squad Challenge"
        subtitle="Set a combined weekly study-hour goal for your squad (enter 0 to clear)"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveChallenge} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-primary)] mb-1">
              Challenge Title (Optional)
            </label>
            <ThemeInput
              value={challengeTitleInput}
              onChange={(e) => setChallengeTitleInput(e.target.value)}
              placeholder="e.g. Sem 3 Mid-Sem 100h Sprint"
              maxLength={80}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-primary)] mb-1">
              Weekly Group Target (Hours) *
            </label>
            <ThemeInput
              type="number"
              min={0}
              max={2000}
              value={challengeHoursInput}
              onChange={(e) => setChallengeHoursInput(e.target.value)}
              required
            />
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {[25, 50, 100, 150, 200].map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => setChallengeHoursInput(String(hrs))}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] hover:border-[var(--ff-accent)] text-[var(--ff-text-primary)]"
                >
                  {hrs}h
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="ghost" size="sm" onClick={() => setChallengeModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" loading={submitting}>
              Save Challenge
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
