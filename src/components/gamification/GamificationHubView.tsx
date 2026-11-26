import React, { useCallback, useEffect, useState } from 'react';
import { Award, Flame, History, Sparkles, Trophy } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import type {
  Achievement,
  GamificationLeaderboardCategory,
  UserGamificationProfile,
  XPProgress,
  XPTransaction,
} from '../../features/gamification/types.ts';
import { calculateXPProgress } from '../../features/gamification/xp-calculator.ts';
import {
  computeGamificationFromRealData,
  computeLeaderboardEntriesFromProfiles,
} from '../../features/gamification/firestoreGamification.ts';
import {
  fetchSquadMemberProfiles,
  getLeaderboardProfile,
  listUserSquads,
  subscribeGlobalLeaderboard,
} from '../../lib/leaderboardService.ts';
import {
  LEVEL_MILESTONES,
  STREAK_REWARDS,
  XP_REWARDS,
} from '../../features/gamification/reward-config.ts';
import GamificationHUD from './GamificationHUD.tsx';
import AchievementCard from './AchievementCard.tsx';
import Leaderboard, { type LeaderboardEntry } from './Leaderboard.tsx';

type GamificationSubTab = 'overview' | 'achievements' | 'leaderboard' | 'history' | 'streaks';

const CATEGORY_OPTIONS: Array<{ id: GamificationLeaderboardCategory; label: string }> = [
  { id: 'global', label: 'Global' },
  { id: 'friends', label: 'Friends' },
  { id: 'squad', label: 'Squad' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all_time', label: 'All Time' },
];

export const GamificationHubView: React.FC = () => {
  const { user, firebaseUser, habits, settings, refreshKey, setCurrentTab } = useApp();
  const currentUserId = firebaseUser?.uid || user?.id || 'usr_guest';

  const [subTab, setSubTab] = useState<GamificationSubTab>('overview');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserGamificationProfile | null>(null);
  const [progress, setProgress] = useState<XPProgress>(() => calculateXPProgress(0));
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [transactions, setTransactions] = useState<XPTransaction[]>([]);

  const [lbCategory, setLbCategory] = useState<GamificationLeaderboardCategory>('all_time');
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbPage, setLbPage] = useState(1);
  const [lbHasMore, setLbHasMore] = useState(false);
  const [lbCurrentUserRank, setLbCurrentUserRank] = useState<number | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [
        tasks,
        focusSessions,
        subjects,
        studyTopics,
        studyPlanTasks,
        studyRevisions,
        freshHabits,
        bills,
        savingsGoals,
        lbProfile,
      ] = await Promise.all([
        api.getTasks().catch(() => []),
        api.getFocusSessions().catch(() => []),
        api.getStudySubjects().catch(() => []),
        api.getStudyTopics().catch(() => []),
        api.getStudyPlanTasks().catch(() => []),
        api.getStudyRevisions().catch(() => []),
        api.getHabits().catch(() => habits || []),
        api.getBills().catch(() => []),
        api.getSavingsGoals().catch(() => []),
        firebaseUser?.uid ? getLeaderboardProfile(firebaseUser.uid).catch(() => null) : Promise.resolve(null),
      ]);

      const resolvedHabits =
        Array.isArray(freshHabits) && freshHabits.length > 0
          ? freshHabits
          : Array.isArray(habits)
          ? habits
          : [];

      const computed = computeGamificationFromRealData({
        userId: currentUserId,
        tasks: Array.isArray(tasks) ? tasks : [],
        focusSessions: Array.isArray(focusSessions) ? focusSessions : [],
        subjects: Array.isArray(subjects) ? subjects : [],
        topics: Array.isArray(studyTopics) ? studyTopics : [],
        studyPlanTasks: Array.isArray(studyPlanTasks) ? studyPlanTasks : [],
        studyRevisions: Array.isArray(studyRevisions) ? studyRevisions : [],
        habits: resolvedHabits,
        bills: Array.isArray(bills) ? bills : [],
        savingsGoals: Array.isArray(savingsGoals) ? savingsGoals : [],
        leaderboardProfile: lbProfile,
        timezone: settings?.timezone,
      });

      setProfile(computed.profile);
      setProgress(computed.progress);
      setAchievements(computed.achievements);
      setTransactions(computed.transactions);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, firebaseUser?.uid, habits, settings?.timezone, refreshKey]);

  const loadLeaderboard = useCallback(
    async (cat: GamificationLeaderboardCategory, pageNum: number, _append: boolean) => {
      setLbLoading(true);
      try {
        if (!firebaseUser?.uid) {
          const guestEntry: LeaderboardEntry = {
            userId: currentUserId,
            displayName: 'You (Local)',
            level: progress.level,
            totalXP: progress.totalXP,
            streak: profile?.currentStreak ?? 0,
            rank: 1,
          };
          setLbEntries([guestEntry]);
          setLbHasMore(false);
          setLbCurrentUserRank(1);
          return;
        }

        if (cat === 'squad') {
          const userSquads = await listUserSquads(firebaseUser.uid).catch(() => []);
          const memberUids = Array.from(
            new Set(userSquads.flatMap((s) => s.memberUids || []))
          );
          const profiles = memberUids.length
            ? await fetchSquadMemberProfiles(memberUids).catch(() => [])
            : [];
          const ranked = computeLeaderboardEntriesFromProfiles({
            profiles,
            category: cat,
            currentUid: firebaseUser.uid,
            currentUserXP: progress.totalXP,
            timezone: settings?.timezone,
          });
          setLbEntries(ranked.slice(0, pageNum * 10));
          setLbHasMore(ranked.length > pageNum * 10);
          const myRank = ranked.find((e) => e.userId === firebaseUser.uid)?.rank ?? null;
          setLbCurrentUserRank(myRank);
          return;
        }

        await new Promise<void>((resolve) => {
          let settled = false;
          const unsub = subscribeGlobalLeaderboard(
            (profiles) => {
              if (settled) return;
              settled = true;
              const ranked = computeLeaderboardEntriesFromProfiles({
                profiles,
                category: cat,
                currentUid: firebaseUser.uid,
                currentUserXP: progress.totalXP,
                timezone: settings?.timezone,
              });
              setLbEntries(ranked.slice(0, pageNum * 10));
              setLbHasMore(ranked.length > pageNum * 10);
              const myRank = ranked.find((e) => e.userId === firebaseUser.uid)?.rank ?? null;
              setLbCurrentUserRank(myRank);
              unsub();
              resolve();
            },
            () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            }
          );
          setTimeout(() => {
            if (!settled) {
              settled = true;
              unsub();
              resolve();
            }
          }, 3000);
        });
      } finally {
        setLbLoading(false);
      }
    },
    [currentUserId, firebaseUser?.uid, profile?.currentStreak, progress.level, progress.totalXP]
  );

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setLbPage(1);
    void loadLeaderboard(lbCategory, 1, false);
  }, [lbCategory, loadLeaderboard]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="space-y-5">
      {/* Top XP HUD */}
      <GamificationHUD
        progress={progress}
        streak={profile?.currentStreak ?? 0}
        dailyXP={profile?.dailyXP ?? 0}
        onOpenAchievements={() => setSubTab('achievements')}
        onOpenLeaderboard={() => setSubTab('leaderboard')}
      />

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border-color)]">
          {(
            [
              { id: 'overview', label: 'Overview', icon: Sparkles },
              { id: 'achievements', label: `Achievements (${unlockedCount}/${achievements.length})`, icon: Award },
              { id: 'leaderboard', label: 'XP Leaderboard', icon: Trophy },
              { id: 'history', label: 'XP History', icon: History },
              { id: 'streaks', label: 'Study Streaks', icon: Flame },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  active
                    ? 'bg-[var(--ff-accent)] text-white shadow-xs'
                    : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setCurrentTab('leaderboard')}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/50 text-[var(--ff-text-secondary)]"
        >
          Open 3D Study Room →
        </button>
      </div>

      {/* Overview */}
      {subTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">XP Breakdown</h3>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)]">
                <div className="text-[var(--ff-text-muted)]">Today</div>
                <div className="text-lg font-extrabold text-[var(--ff-text-primary)]">
                  {profile?.dailyXP ?? 0} XP
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)]">
                <div className="text-[var(--ff-text-muted)]">This Week</div>
                <div className="text-lg font-extrabold text-[var(--ff-text-primary)]">
                  {profile?.weeklyXP ?? 0} XP
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)]">
                <div className="text-[var(--ff-text-muted)]">This Month</div>
                <div className="text-lg font-extrabold text-[var(--ff-text-primary)]">
                  {profile?.monthlyXP ?? 0} XP
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)]">
                <div className="text-[var(--ff-text-muted)]">Lifetime</div>
                <div className="text-lg font-extrabold text-[var(--ff-accent-text)]">
                  {progress.totalXP.toLocaleString()} XP
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-[var(--ff-border-color)] text-[11px] text-[var(--ff-text-muted)] space-y-1">
              <div>• Complete Task: +{XP_REWARDS.task_completion} XP</div>
              <div>• Verified Focus Session: +{XP_REWARDS.focus_session} XP</div>
              <div>• Master Study Topic: +{XP_REWARDS.topic_completion} XP</div>
              <div>• Daily Study Goal: +{XP_REWARDS.daily_goal} XP</div>
            </div>
          </div>

          <div className="lg:col-span-2 p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Featured Achievements
              </h3>
              <button
                type="button"
                onClick={() => setSubTab('achievements')}
                className="text-xs font-semibold text-[var(--ff-accent-text)]"
              >
                View All →
              </button>
            </div>
            {loading ? (
              <div className="text-xs text-[var(--ff-text-muted)] py-6 text-center">
                Loading achievements...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {achievements.slice(0, 4).map((ach) => (
                  <AchievementCard key={ach.id} achievement={ach} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Achievements */}
      {subTab === 'achievements' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {achievements.map((ach) => (
            <AchievementCard key={ach.id} achievement={ach} />
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {subTab === 'leaderboard' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setLbCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  lbCategory === cat.id
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                    : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <Leaderboard
            entries={lbEntries}
            currentUserId={currentUserId}
            loading={lbLoading}
            hasMore={lbHasMore}
            currentUserRank={lbCurrentUserRank}
            onLoadMore={() => {
              const nextPage = lbPage + 1;
              setLbPage(nextPage);
              void loadLeaderboard(lbCategory, nextPage, true);
            }}
          />
        </div>
      )}

      {/* XP History */}
      {subTab === 'history' && (
        <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
          <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Recent XP Ledger</h3>
          {transactions.length === 0 ? (
            <div className="text-xs text-[var(--ff-text-muted)] py-8 text-center">
              Complete tasks, verified focus sessions, or syllabus topics to earn your first XP!
            </div>
          ) : (
            <div className="divide-y divide-[var(--ff-border-color)]">
              {transactions.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--ff-text-primary)] truncate">
                      {tx.description}
                    </div>
                    <div className="text-[10px] text-[var(--ff-text-muted)]">
                      {new Date(tx.createdAt).toLocaleString()} · {tx.source}
                    </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 shrink-0">
                    +{tx.amount} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Study Streaks & Level Milestones */}
      {subTab === 'streaks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Streak Milestones</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)]">
                <div className="text-[var(--ff-text-muted)]">Current Streak</div>
                <div className="text-2xl font-extrabold text-amber-400">
                  🔥 {profile?.currentStreak ?? 0}d
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)]">
                <div className="text-[var(--ff-text-muted)]">Longest Streak</div>
                <div className="text-2xl font-extrabold text-[var(--ff-text-primary)]">
                  🏆 {profile?.longestStreak ?? 0}d
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              {Object.entries(STREAK_REWARDS).map(([days, xp]) => {
                const reached = (profile?.longestStreak ?? 0) >= Number(days);
                return (
                  <div
                    key={days}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] text-xs"
                  >
                    <span>{days}-Day Study Streak</span>
                    <span className={reached ? 'text-emerald-400 font-bold' : 'text-[var(--ff-text-muted)]'}>
                      {reached ? `✓ +${xp} XP` : `+${xp} XP`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Level Milestones</h3>
            <div className="space-y-2">
              {LEVEL_MILESTONES.map((m) => {
                const unlocked = progress.level >= m.level;
                return (
                  <div
                    key={m.level}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] text-xs"
                  >
                    <div>
                      <span className="font-bold text-[var(--ff-text-primary)]">
                        Lv.{m.level} {m.title}
                      </span>
                      <div className="text-[10px] text-[var(--ff-text-muted)]">{m.reward}</div>
                    </div>
                    <span className={unlocked ? 'text-emerald-400 font-bold' : 'text-[var(--ff-text-muted)]'}>
                      {unlocked ? 'Unlocked ✓' : 'Locked'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamificationHubView;

