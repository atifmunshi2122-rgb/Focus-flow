import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Copy, KeyRound, LogOut, Lock, Search, Shield, Sparkles, User, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import {
  aggregateFocusStatsForLeaderboard,
  computeSquadChallengeProgress,
  createStudySquad,
  fetchSquadMemberProfiles,
  formatFocusMinutesShort,
  getCurrentPeriodKeys,
  getEffectivePeriodMinutes,
  isProfileStudyingLive,
  joinStudySquadByCode,
  leaveStudySquad,
  listUserSquads,
  subscribeGlobalLeaderboard,
} from '../../lib/leaderboardService.ts';
import type { LeaderboardProfile, StudySquad } from '../../types/leaderboard.ts';
import type { SocialProfile, UserPrivacySettings } from '../../features/social/types.ts';
import type {
  GroupStudySession,
  RoomInvitation,
  SocialNotification,
  SocialStudySquad,
  SquadChallengeSummary,
  SquadInvitation,
  StudyChatMessage,
} from '../../features/social/squad-types.ts';
import type { SocialActivityEvent } from '../../features/social/activity-types.ts';
import FriendList from './FriendList.tsx';
import CreateSquadForm from './CreateSquadForm.tsx';
import SharedStudyTimer from './SharedStudyTimer.tsx';
import StudyChat from './StudyChat.tsx';
import { startOrJoinGoogleMeetCall } from '../../lib/googleMeetService.ts';
import {
  buildDmRoomId,
  clearStudyChat,
  deleteStudyChatMessage,
  markChatRoomRead,
  sendStudyChatMessage,
  setStudyChatTyping,
  subscribeStudyChatMessages,
  subscribeStudyChatTyping,
  toggleStudyChatReaction,
  type ChatChannelRef,
  type TypingUser,
} from '../../lib/studyChatService.ts';

export const SocialHubView: React.FC = () => {
  const {
    user,
    firebaseUser,
    settings,
    isRunning,
    timerMode,
    setCurrentTab,
    setTimerEngine,
    switchTimerMode,
    startTimer,
    showToast,
    confirmAction,
  } = useApp();
  const currentUserId = firebaseUser?.uid || user?.id || 'usr_guest';
  const currentUserName = firebaseUser?.displayName || user?.name || 'Student';
  const isInDeepFocus = isRunning && timerMode === 'work';

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<SocialProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [squads, setSquads] = useState<Array<SocialStudySquad & { myRole: string }>>([]);
  const [squadInvitations, setSquadInvitations] = useState<SquadInvitation[]>([]);
  const [roomInvitations, setRoomInvitations] = useState<RoomInvitation[]>([]);
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [activities, setActivities] = useState<SocialActivityEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<GroupStudySession[]>([]);
  const [privacy, setPrivacy] = useState<UserPrivacySettings>({
    allowFriendRequests: true,
    showOnlineStatus: true,
    showStudyProgress: true,
    allowRoomInvites: true,
  });

  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [firestoreSquads, setFirestoreSquads] = useState<StudySquad[]>([]);
  const [squadMembers, setSquadMembers] = useState<LeaderboardProfile[]>([]);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningSquad, setJoiningSquad] = useState(false);
  const [callingMode, setCallingMode] = useState<'audio' | 'video' | null>(null);
  const [challenges, setChallenges] = useState<SquadChallengeSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<StudyChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [dmTarget, setDmTarget] = useState<LeaderboardProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<SocialProfile | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [data, fsSquads] = await Promise.all([
        api.getSocialOverview().catch(() => null),
        firebaseUser?.uid ? listUserSquads(firebaseUser.uid).catch(() => []) : Promise.resolve([]),
      ]);

      if (data) {
        setFriends(data.friends || []);
        setIncomingRequests(data.incomingRequests || []);
        setSquadInvitations(data.squadInvitations || []);
        setRoomInvitations(data.roomInvitations || []);
        setNotifications(data.notifications || []);
        setActivities(data.activities || []);
        setActiveSessions(data.activeSessions || []);
        if (data.privacy) setPrivacy(data.privacy);
      }

      if (firebaseUser?.uid) {
        setFirestoreSquads(fsSquads);
        const mappedSquads: Array<SocialStudySquad & { myRole: string }> = fsSquads.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description || `Invite Code: ${s.inviteCode}`,
          icon: '📚',
          privacy: 'private',
          ownerId: s.ownerUid,
          memberCount: s.memberUids.length,
          createdAt: Date.parse(s.createdAt) || Date.now(),
          updatedAt: Date.parse(s.updatedAt) || Date.now(),
          myRole: s.ownerUid === firebaseUser.uid ? 'owner' : 'member',
        }));
        setSquads(mappedSquads);
        if (!selectedSquadId && mappedSquads.length > 0) {
          setSelectedSquadId(mappedSquads[0].id);
        } else if (selectedSquadId && !mappedSquads.some((s) => s.id === selectedSquadId)) {
          setSelectedSquadId(mappedSquads[0]?.id || null);
        }
      } else if (data?.squads) {
        setSquads(data.squads);
        if (!selectedSquadId && data.squads.length > 0) {
          setSelectedSquadId(data.squads[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [firebaseUser?.uid, selectedSquadId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedSquadId) {
      setSquadMembers([]);
      return;
    }
    const fsSquad = firestoreSquads.find((s) => s.id === selectedSquadId);
    if (firebaseUser?.uid && fsSquad) {
      void Promise.all([
        fetchSquadMemberProfiles(fsSquad.memberUids),
        api.getFocusSessions().catch(() => []),
      ])
        .then(([memberProfiles, localSessions]) => {
          const { weekKey } = getCurrentPeriodKeys(settings?.timezone);
          const ownStats = aggregateFocusStatsForLeaderboard({
            sessions: Array.isArray(localSessions) ? localSessions : [],
            timezone: settings?.timezone,
          });
          const mergedProfiles = memberProfiles.map((mp) =>
            mp.uid === firebaseUser.uid
              ? {
                  ...mp,
                  todayKey: ownStats.todayKey,
                  weekKey: ownStats.weekKey,
                  monthKey: ownStats.monthKey,
                  todayMinutes: Math.max(mp.todayMinutes || 0, ownStats.todayMinutes),
                  weekMinutes: Math.max(mp.weekMinutes || 0, ownStats.weekMinutes),
                  monthMinutes: Math.max(mp.monthMinutes || 0, ownStats.monthMinutes),
                }
              : mp
          );
          setSquadMembers(mergedProfiles);
          const goalHours = Math.max(1, fsSquad.weeklyGoalHours || 20);
          const progressStats = computeSquadChallengeProgress({
            squad: { ...fsSquad, weeklyGoalHours: goalHours },
            memberProfiles: mergedProfiles,
            timezone: settings?.timezone,
          });
          setChallenges([
            {
              id: `fs_chal_${fsSquad.id}_${weekKey}`,
              title: fsSquad.challengeTitle || `Squad ${goalHours}h Weekly Focus Goal`,
              goal: progressStats?.goalMinutes || goalHours * 60,
              progress: progressStats?.completedMinutes || 0,
              rewardXP: 150,
            } as SquadChallengeSummary,
          ]);
        })
        .catch(() => {
          setSquadMembers([]);
          setChallenges([]);
        });
    } else {
      setSquadMembers([]);
      void api
        .getSquadWeeklyChallenges(selectedSquadId)
        .then((res) => setChallenges(res.challenges || []))
        .catch(() => setChallenges([]));
    }
  }, [selectedSquadId, firestoreSquads, firebaseUser?.uid, settings?.timezone]);

  const activeChatChannel: ChatChannelRef | null = useMemo(() => {
    if (dmTarget && currentUserId) {
      return { kind: 'dm', id: buildDmRoomId(currentUserId, dmTarget.uid) };
    }
    if (selectedSquadId) {
      return { kind: 'squad', id: selectedSquadId };
    }
    return null;
  }, [dmTarget, selectedSquadId, currentUserId]);

  useEffect(() => {
    if (!activeChatChannel) {
      setChatMessages([]);
      setTypingUsers([]);
      return;
    }
    const unsubMsgs = subscribeStudyChatMessages(
      activeChatChannel,
      (msgs) => {
        setChatMessages(msgs);
        markChatRoomRead(currentUserId, activeChatChannel);
      },
      { isAuthenticated: Boolean(firebaseUser?.uid) }
    );
    const unsubTyping = subscribeStudyChatTyping(
      activeChatChannel,
      currentUserId,
      setTypingUsers,
      { isAuthenticated: Boolean(firebaseUser?.uid) }
    );
    return () => {
      unsubMsgs();
      unsubTyping();
    };
  }, [activeChatChannel, currentUserId, firebaseUser?.uid]);

  const handleJoinSquadByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser?.uid) {
      showToast('Sign in with Google to join a Firestore Study Squad.', 'info');
      return;
    }
    const clean = joinCodeInput.trim().toUpperCase();
    if (clean.length < 6) {
      showToast('Enter a valid 6-character squad invite code.', 'error');
      return;
    }
    setJoiningSquad(true);
    try {
      const sessions = await api.getFocusSessions().catch(() => []);
      const joined = await joinStudySquadByCode({
        uid: firebaseUser.uid,
        inviteCode: clean,
        displayName: firebaseUser.displayName || undefined,
        sessions: Array.isArray(sessions) ? sessions : [],
        timezone: settings?.timezone,
      });
      setJoinCodeInput('');
      setSelectedSquadId(joined.id);
      window.dispatchEvent(new Event('ff:squads-updated'));
      showToast(`Joined squad "${joined.name}"!`, 'success');
      await loadOverview();
    } catch (err: any) {
      showToast(err?.message || 'Unable to join squad', 'error');
    } finally {
      setJoiningSquad(false);
    }
  };

  const handleLeaveSelectedSquad = async (squadId: string, squadName: string) => {
    if (!firebaseUser?.uid) return;
    const confirmed = await confirmAction({
      title: 'Leave Study Squad?',
      message: `Are you sure you want to leave "${squadName}"? You will need an invite code to rejoin.`,
      confirmLabel: 'Leave Squad',
      cancelLabel: 'Stay',
    });
    if (!confirmed) return;
    try {
      await leaveStudySquad(firebaseUser.uid, squadId);
      window.dispatchEvent(new Event('ff:squads-updated'));
      showToast(`Left squad "${squadName}"`, 'info');
      setSelectedSquadId(null);
      await loadOverview();
    } catch {
      showToast('Failed to leave squad', 'error');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    try {
      const fetchLeaderboardUsers = () =>
        new Promise<LeaderboardProfile[]>((resolve) => {
          let settled = false;
          let unsub: (() => void) | null = null;
          let shouldUnsubImmediately = false;
          const safeUnsub = () => {
            if (unsub) {
              unsub();
            } else {
              shouldUnsubImmediately = true;
            }
          };
          const timer = window.setTimeout(() => {
            if (!settled) {
              settled = true;
              safeUnsub();
              resolve([]);
            }
          }, 3000);
          unsub = subscribeGlobalLeaderboard(
            (profiles) => {
              if (!settled) {
                settled = true;
                window.clearTimeout(timer);
                safeUnsub();
                resolve(profiles);
              }
            },
            () => {
              if (!settled) {
                settled = true;
                window.clearTimeout(timer);
                safeUnsub();
                resolve([]);
              }
            }
          );
          if (shouldUnsubImmediately) {
            unsub();
          }
        });

      const allSquadMemberUids = Array.from(
        new Set(firestoreSquads.flatMap((s) => s.memberUids || []))
      ).filter((uid) => uid && uid !== firebaseUser?.uid);

      const [apiRes, lbEntries, privateSquadProfiles] = await Promise.all([
        api.searchSocialUsers(searchQuery, 1, 10).catch(() => ({ users: [] })),
        firebaseUser?.uid ? fetchLeaderboardUsers() : Promise.resolve([]),
        firebaseUser?.uid && allSquadMemberUids.length > 0
          ? fetchSquadMemberProfiles(allSquadMemberUids).catch(() => [])
          : Promise.resolve([]),
      ]);
      const merged: any[] = [...(apiRes.users || [])];
      const seenIds = new Set(merged.map((u) => u.userId));
      for (const entry of [...privateSquadProfiles, ...squadMembers, ...lbEntries]) {
        if (!entry.uid || entry.uid === firebaseUser?.uid || seenIds.has(entry.uid)) continue;
        if (!q || (entry.displayName || '').toLowerCase().includes(q)) {
          seenIds.add(entry.uid);
          const alreadyFriend = friends.some((f) => f.userId === entry.uid);
          merged.push({
            userId: entry.uid,
            displayName: entry.displayName || 'Study Member',
            relationshipStatus: alreadyFriend ? 'friends' : 'none',
          });
        }
      }
      setSearchResults(merged.slice(0, 10));
      if (merged.length === 0) {
        showToast('No matching study friends found.', 'info');
      }
    } catch {
      showToast('Failed to search users', 'error');
    }
  };

  const activeSession = activeSessions.find((s) => !selectedSquadId || s.squadId === selectedSquadId) || activeSessions[0] || null;

  return (
    <div className="space-y-5">
      {/* Top Summary Bar */}
      <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">
              Social Study &amp; Squads
            </h2>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            {friends.length} Friends · {squads.length} Squads · {notifications.filter((n) => !n.read).length} Unread Notifications
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCurrentTab('leaderboard')}
          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--ff-accent)] text-white hover:opacity-90 flex items-center gap-1.5 self-start md:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Enter 3D Study Room</span>
        </button>
      </div>

      {/* Main Grid: Friends + Squads + Shared Timer + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: Friends & Discovery + Privacy */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Find Study Friends</h3>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search display name..."
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-xs bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--ff-accent)] text-white flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Find</span>
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="space-y-2 pt-1">
                {searchResults.map((u) => (
                  <div
                    key={u.userId}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--ff-surface-muted)] text-xs"
                  >
                    <span className="font-semibold truncate">{u.displayName}</span>
                    {u.relationshipStatus === 'none' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.sendFriendRequest(u.userId);
                            showToast(`Friend request sent to ${u.displayName}`, 'success');
                            void loadOverview();
                          } catch (err: any) {
                            showToast(err?.message || 'Unable to send request', 'error');
                          }
                        }}
                        className="px-2 py-1 rounded-lg bg-[var(--ff-accent)]/20 text-[var(--ff-accent-text)] font-semibold"
                      >
                        Add Friend
                      </button>
                    ) : (
                      <span className="text-[10px] text-[var(--ff-text-muted)] capitalize">
                        {u.relationshipStatus}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {incomingRequests.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--ff-border-color)]">
                <div className="text-[11px] font-bold text-[var(--ff-text-muted)]">
                  Pending Friend Requests ({incomingRequests.length})
                </div>
                {incomingRequests.map((req) => (
                  <div
                    key={req.friendship.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--ff-surface-muted)] text-xs"
                  >
                    <span className="font-semibold truncate">{req.sender?.displayName}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          void api.respondFriendRequest(req.friendship.id, 'accept').then(() => loadOverview())
                        }
                        className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-semibold"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void api.respondFriendRequest(req.friendship.id, 'reject').then(() => loadOverview())
                        }
                        className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-400 font-semibold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <FriendList
              friends={friends}
              loading={loading}
              onOpenProfile={(uid) => {
                const found = friends.find((f) => f.userId === uid) || null;
                setSelectedProfile(found);
              }}
              onInvite={async (uid) => {
                try {
                  await api.sendRoomInvitation({
                    roomId: selectedSquadId || 'global_lounge',
                    squadId: selectedSquadId || undefined,
                    roomName: squads.find((s) => s.id === selectedSquadId)?.name || 'Study Lounge',
                    recipientId: uid,
                  });
                  showToast('Study room invitation sent!', 'success');
                } catch (err: any) {
                  showToast(err?.message || 'Unable to invite friend', 'error');
                }
              }}
            />

            {selectedProfile && (
              <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-accent)]/40 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <strong>{selectedProfile.displayName}</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedProfile(null)}
                    className="text-[10px] text-[var(--ff-text-muted)]"
                  >
                    Close
                  </button>
                </div>
                <div className="text-[var(--ff-text-muted)]">
                  Level {selectedProfile.level ?? 1} · {selectedProfile.totalXP ?? 0} XP · 🔥{' '}
                  {selectedProfile.currentStreak ?? 0}d
                </div>
              </div>
            )}
          </div>

          {/* Privacy Controls */}
          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ff-text-primary)]">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Social Privacy Controls</span>
            </div>
            {(
              [
                { key: 'allowFriendRequests', label: 'Allow Friend Requests' },
                { key: 'showOnlineStatus', label: 'Show Online Status' },
                { key: 'showStudyProgress', label: 'Show Level, XP & Streak' },
                { key: 'allowRoomInvites', label: 'Allow Study Room Invites' },
              ] as const
            ).map((item) => (
              <label key={item.key} className="flex items-center justify-between text-xs cursor-pointer">
                <span className="text-[var(--ff-text-secondary)]">{item.label}</span>
                <input
                  type="checkbox"
                  checked={privacy[item.key]}
                  onChange={async (e) => {
                    const next = await api.updateSocialPrivacy({ [item.key]: e.target.checked });
                    setPrivacy(next);
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Column 2: My Squads, Challenges & Shared Focus Timer */}
        <div className="space-y-4">
          <CreateSquadForm
            onCreate={async (data) => {
              if (firebaseUser?.uid) {
                const sessions = await api.getFocusSessions().catch(() => []);
                const created = await createStudySquad({
                  uid: firebaseUser.uid,
                  name: data.name,
                  description: data.description,
                  displayName: firebaseUser.displayName || undefined,
                  sessions: Array.isArray(sessions) ? sessions : [],
                });
                showToast(`Created squad "${created.name}" (Code: ${created.inviteCode})!`, 'success');
                setSelectedSquadId(created.id);
                window.dispatchEvent(new Event('ff:squads-updated'));
                await loadOverview();
                return;
              }
              const created = await api.createSocialSquad(data);
              showToast(`Created squad "${created.name}"!`, 'success');
              setSelectedSquadId(created.id);
              await loadOverview();
            }}
          />

          {firebaseUser?.uid && (
            <form
              onSubmit={handleJoinSquadByCode}
              className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2.5"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--ff-text-primary)]">
                <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                <span>Join Squad by Invite Code</span>
              </div>
              <div className="flex gap-2">
                <input
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="6-char code (e.g. AB12CD)"
                  maxLength={6}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-xs font-mono uppercase bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                />
                <button
                  type="submit"
                  disabled={joiningSquad || joinCodeInput.trim().length < 6}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--ff-accent)] text-white disabled:opacity-50"
                >
                  {joiningSquad ? 'Joining...' : 'Join'}
                </button>
              </div>
            </form>
          )}

          {squads.length > 0 && (
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">My Study Squads</h3>
                {(() => {
                  const activeFs = firestoreSquads.find((s) => s.id === selectedSquadId);
                  if (!activeFs) return null;
                  return (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(activeFs.inviteCode);
                          showToast(`Copied invite code ${activeFs.inviteCode}`, 'success');
                        }}
                        className="px-2 py-1 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[11px] font-mono font-bold text-indigo-400 flex items-center gap-1 hover:border-indigo-400/60"
                        title="Copy squad invite code"
                      >
                        <span>{activeFs.inviteCode}</span>
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLeaveSelectedSquad(activeFs.id, activeFs.name)}
                        className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-rose-400"
                        title="Leave squad"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {squads.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSquadId(s.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      selectedSquadId === s.id
                        ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                        : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)]'
                    }`}
                  >
                    {s.icon || '📚'} {s.name} ({s.memberCount})
                  </button>
                ))}
              </div>

              {squadMembers.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[var(--ff-border-color)]">
                  <div className="text-[11px] font-bold text-[var(--ff-text-muted)]">
                    Live Squad Members ({squadMembers.length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {squadMembers.map((m) => {
                      const keys = getCurrentPeriodKeys(settings?.timezone);
                      const weekMins = getEffectivePeriodMinutes(m, 'week', keys);
                      const studying = isProfileStudyingLive(m);
                      return (
                        <div
                          key={m.uid}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--ff-surface-muted)] text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                studying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500/60'
                              }`}
                            />
                            <span className="font-semibold truncate text-[var(--ff-text-primary)]">
                              {m.displayName || 'Focus Student'}
                            </span>
                            {studying && (
                              <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
                                Studying
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-[var(--ff-text-muted)] shrink-0">
                            {formatFocusMinutesShort(weekMins)}/wk · 🔥{m.streakDays || 0}d
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {challenges.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--ff-border-color)]">
                  <div className="text-[11px] font-bold text-[var(--ff-text-muted)]">
                    Weekly Squad Challenges
                  </div>
                  {challenges.map((ch) => {
                    const pct = Math.min(100, Math.round((ch.progress / Math.max(1, ch.goal)) * 100));
                    return (
                      <div key={ch.id} className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span>{ch.title}</span>
                          <span className="font-mono text-[11px] text-indigo-300">
                            {ch.progress}/{ch.goal} · +{ch.rewardXP} XP
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-black/25 overflow-hidden">
                          <div className="h-full bg-[var(--ff-accent)]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeSession ? (
            <SharedStudyTimer
              session={activeSession}
              canControl={activeSession.hostId === currentUserId}
              onStart={() =>
                api.transitionGroupStudySession(activeSession.id, 'start').then(() => loadOverview())
              }
              onPause={() =>
                api.transitionGroupStudySession(activeSession.id, 'pause').then(() => loadOverview())
              }
              onResume={() =>
                api.transitionGroupStudySession(activeSession.id, 'resume').then(() => loadOverview())
              }
              onEnd={() =>
                api.transitionGroupStudySession(activeSession.id, 'end').then(() => loadOverview())
              }
            />
          ) : (
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex items-center justify-between gap-2">
              <div className="text-xs text-[var(--ff-text-muted)]">
                Start a 25m synchronized squad focus session
              </div>
              <button
                type="button"
                onClick={async () => {
                  await api.createGroupStudySession({
                    squadId: selectedSquadId || undefined,
                    roomId: selectedSquadId || 'global_lounge',
                    durationSeconds: 25 * 60,
                  });
                  await loadOverview();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--ff-accent)] text-white shrink-0"
              >
                New 25m Session
              </button>
            </div>
          )}
        </div>

        {/* Column 3: Real-Time Group Chat, 1-on-1 DM, Invites & Notifications */}
        <div className="space-y-4">
          {activeChatChannel ? (
            <div className="space-y-2">
              {/* Squad Group vs 1-on-1 DM Switcher */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setDmTarget(null)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors ${
                    !dmTarget
                      ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                      : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-hover)]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{squads.find((s) => s.id === selectedSquadId)?.name || 'Squad Chat'}</span>
                </button>
                {squadMembers
                  .filter((m) => m.uid !== currentUserId)
                  .map((member) => {
                    const isSelectedDm = dmTarget?.uid === member.uid;
                    return (
                      <button
                        key={member.uid}
                        type="button"
                        onClick={() => setDmTarget(member)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors ${
                          isSelectedDm
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-hover)]'
                        }`}
                        title={`Direct message ${member.displayName}`}
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>DM · {member.displayName.split(' ')[0]}</span>
                      </button>
                    );
                  })}
              </div>

              <StudyChat
                messages={chatMessages}
                currentUserId={currentUserId}
                title={dmTarget ? dmTarget.displayName : squads.find((s) => s.id === selectedSquadId)?.name || 'Study Chat'}
                subtitle={dmTarget ? 'Direct Message (Real-Time)' : 'Group Conversation (Real-Time)'}
                typingUsers={typingUsers}
                isRecipientInFocus={isInDeepFocus}
                onSend={async (payload) => {
                  try {
                    await sendStudyChatMessage({
                      channel: activeChatChannel,
                      senderId: currentUserId,
                      senderName: currentUserName,
                      ...payload,
                      isAuthenticated: Boolean(firebaseUser?.uid),
                    });
                  } catch (err: any) {
                    showToast(err?.message || 'Unable to send chat message right now.', 'error');
                    throw err;
                  }
                }}
                onReact={async (msg, emoji) => {
                  await toggleStudyChatReaction({
                    channel: activeChatChannel,
                    message: msg,
                    emoji,
                    userId: currentUserId,
                    isAuthenticated: Boolean(firebaseUser?.uid),
                  });
                }}
                onDeleteMessage={async (msg) => {
                  const confirmed = await confirmAction({
                    title: 'Delete Message?',
                    message: 'This message will be deleted for everyone in this chat.',
                    confirmLabel: 'Delete',
                    tone: 'danger',
                  });
                  if (!confirmed) return;
                  await deleteStudyChatMessage({
                    channel: activeChatChannel,
                    messageId: msg.id,
                    userId: currentUserId,
                    isAuthenticated: Boolean(firebaseUser?.uid),
                  });
                }}
                onClearChat={async () => {
                  const confirmed = await confirmAction({
                    title: 'Clear Entire Chat?',
                    message: dmTarget
                      ? `This will permanently clear all messages between you and ${dmTarget.displayName} for BOTH people.`
                      : 'This will permanently clear all messages in this squad chat for everyone.',
                    confirmLabel: 'Clear for Everyone',
                    tone: 'danger',
                  });
                  if (!confirmed) return;
                  const res = await clearStudyChat({
                    channel: activeChatChannel,
                    userId: currentUserId,
                    isAuthenticated: Boolean(firebaseUser?.uid),
                  });
                  showToast(
                    res.cloudSynced
                      ? 'Chat cleared for everyone.'
                      : 'Chat cleared locally (deploy Firestore rules to sync deletion for both users).',
                    res.cloudSynced ? 'success' : 'info'
                  );
                }}
                onTypingChange={(typing) => {
                  void setStudyChatTyping({
                    channel: activeChatChannel,
                    uid: currentUserId,
                    displayName: currentUserName,
                    isTyping: typing,
                    isAuthenticated: Boolean(firebaseUser?.uid),
                  });
                }}
                onJoinSprint={(durationMinutes) => {
                  setTimerEngine('pomodoro');
                  switchTimerMode('work', durationMinutes);
                  startTimer();
                  setCurrentTab('focus');
                  showToast(`Joined ${durationMinutes}m Deep Focus sprint!`, 'success');
                }}
                callingMode={callingMode}
                onStartCall={async (mode) => {
                  if (!activeChatChannel || callingMode) return;
                  setCallingMode(mode);
                  try {
                    const res = await startOrJoinGoogleMeetCall({
                      roomKey: activeChatChannel.id,
                      mode,
                      loginHint: firebaseUser?.email || undefined,
                    });
                    window.open(res.meetingUri, '_blank', 'noopener,noreferrer');
                    const label = mode === 'audio' ? '🎙️ Voice Call started' : '📹 Video Call started';
                    const text = `${label} — Join Google Meet: ${res.meetingUri}`;
                    await sendStudyChatMessage({
                      channel: activeChatChannel,
                      senderId: currentUserId,
                      senderName: currentUserName,
                      text,
                      messageType: 'call_link',
                      metadata: { meetingUri: res.meetingUri },
                      isAuthenticated: Boolean(firebaseUser?.uid),
                    }).catch(() => {});
                    showToast(
                      mode === 'audio'
                        ? '🎙️ Google Meet Voice Call opened!'
                        : '📹 Google Meet Video Call opened!',
                      'success'
                    );
                  } finally {
                    setCallingMode(null);
                  }
                }}
              />
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-center text-xs text-[var(--ff-text-muted)]">
              <Lock className="w-5 h-5 mx-auto mb-2 opacity-60" />
              Create or join a Study Squad to unlock real-time Squad Chat.
            </div>
          )}

          {(squadInvitations.length > 0 || roomInvitations.length > 0 || notifications.length > 0) && (
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--ff-text-primary)]">
                <Bell className="w-4 h-4 text-amber-400" />
                <span>Invitations &amp; Notifications</span>
              </div>
              {roomInvitations.map((inv) => (
                <div key={inv.id} className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] text-xs flex items-center justify-between gap-2">
                  <span>
                    <strong>{inv.senderName}</strong> invited you to {inv.roomName}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void api.respondRoomInvitation(inv.id, 'accept').then(() => {
                          setCurrentTab('leaderboard');
                        })
                      }
                      className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-semibold"
                    >
                      Join
                    </button>
                    <button
                      type="button"
                      onClick={() => void api.respondRoomInvitation(inv.id, 'reject').then(() => loadOverview())}
                      className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-400 font-semibold"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
              {notifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  onClick={() => void api.markSocialNotificationRead(n.id).then(() => loadOverview())}
                  className={`p-2.5 rounded-xl text-xs cursor-pointer ${
                    n.read ? 'bg-[var(--ff-surface-muted)]/40 opacity-70' : 'bg-indigo-500/15 border border-indigo-400/30'
                  }`}
                >
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-[11px] text-[var(--ff-text-muted)]">{n.body}</div>
                </div>
              ))}
            </div>
          )}

          {activities.length > 0 && (
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2">
              <h3 className="text-xs font-bold text-[var(--ff-text-primary)]">Recent Squad Activity</h3>
              {activities.slice(0, 5).map((act) => (
                <div key={act.id} className="text-[11px] text-[var(--ff-text-secondary)]">
                  • <strong>{act.actorName || 'Member'}</strong> — {act.type.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SocialHubView;

