import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Lock, Search, Shield, Sparkles, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
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

export const SocialHubView: React.FC = () => {
  const { user, firebaseUser, setCurrentTab, showToast } = useApp();
  const currentUserId = firebaseUser?.uid || user?.id || 'usr_guest';

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
  const [challenges, setChallenges] = useState<SquadChallengeSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<StudyChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<SocialProfile | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSocialOverview();
      if (data) {
        setFriends(data.friends || []);
        setIncomingRequests(data.incomingRequests || []);
        setSquads(data.squads || []);
        setSquadInvitations(data.squadInvitations || []);
        setRoomInvitations(data.roomInvitations || []);
        setNotifications(data.notifications || []);
        setActivities(data.activities || []);
        setActiveSessions(data.activeSessions || []);
        if (data.privacy) setPrivacy(data.privacy);
        if (!selectedSquadId && data.squads?.length > 0) {
          setSelectedSquadId(data.squads[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSquadId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedSquadId) return;
    void api
      .getSquadWeeklyChallenges(selectedSquadId)
      .then((res) => setChallenges(res.challenges || []))
      .catch(() => setChallenges([]));
    void api
      .getSocialChat({ squadId: selectedSquadId, limit: 25 })
      .then((res) => setChatMessages(res.messages || []))
      .catch(() => setChatMessages([]));
  }, [selectedSquadId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.searchSocialUsers(searchQuery, 1, 10);
      setSearchResults(res.users || []);
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
              const created = await api.createSocialSquad(data);
              showToast(`Created squad "${created.name}"!`, 'success');
              setSelectedSquadId(created.id);
              await loadOverview();
            }}
          />

          {squads.length > 0 && (
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">My Study Squads</h3>
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

        {/* Column 3: Real-Time Group Chat, Invites & Notifications */}
        <div className="space-y-4">
          {selectedSquadId ? (
            <StudyChat
              messages={chatMessages}
              currentUserId={currentUserId}
              onSend={async (text) => {
                const msg = await api.sendSocialChat({ squadId: selectedSquadId, text });
                setChatMessages((prev) => [...prev, msg]);
              }}
              onReact={async (messageId, emoji) => {
                const upd = await api.reactSocialChat(messageId, emoji);
                setChatMessages((prev) => prev.map((m) => (m.id === upd.id ? upd : m)));
              }}
            />
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

