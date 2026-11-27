import React, { useEffect, useMemo, useState } from 'react';
import { BellOff, MessageSquare, Users, User, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import StudyChat, { type SendMessagePayload } from './StudyChat.tsx';
import {
  buildDmRoomId,
  getLastReadTimestamp,
  markChatRoomRead,
  sendStudyChatMessage,
  setStudyChatTyping,
  subscribeStudyChatMessages,
  subscribeStudyChatTyping,
  toggleStudyChatReaction,
  type ChatChannelRef,
  type TypingUser,
} from '../../lib/studyChatService.ts';
import {
  fetchSquadMemberProfiles,
  listUserSquads,
} from '../../lib/leaderboardService.ts';
import { startOrJoinGoogleMeetCall } from '../../lib/googleMeetService.ts';
import type { LeaderboardProfile, StudySquad } from '../../types/leaderboard.ts';
import type { StudyChatMessage } from '../../features/social/squad-types.ts';

export const FloatingMiniChat: React.FC = () => {
  const {
    firebaseUser,
    user,
    currentTab,
    isRunning,
    timerMode,
    fullScreenFocus,
    setCurrentTab,
    setTimerEngine,
    switchTimerMode,
    startTimer,
    showToast,
  } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [squads, setSquads] = useState<StudySquad[]>([]);
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [members, setMembers] = useState<LeaderboardProfile[]>([]);
  const [dmTarget, setDmTarget] = useState<LeaderboardProfile | null>(null);
  const [messages, setMessages] = useState<StudyChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [callingMode, setCallingMode] = useState<'audio' | 'video' | null>(null);

  const currentUid = firebaseUser?.uid || user?.id || '';
  const currentName = firebaseUser?.displayName || user?.name || 'Student';
  const isInDeepFocus = isRunning && timerMode === 'work';

  // Load user's Firestore squads
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setSquads([]);
      setSelectedSquadId(null);
      return;
    }
    let cancelled = false;
    void listUserSquads(firebaseUser.uid)
      .then((list: StudySquad[]) => {
        if (cancelled) return;
        setSquads(list);
        setSelectedSquadId((prev) =>
          prev && list.some((s) => s.id === prev) ? prev : list[0]?.id || null
        );
      })
      .catch(() => {
        if (!cancelled) setSquads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.uid]);

  const activeSquad = useMemo(
    () => squads.find((s) => s.id === selectedSquadId) || squads[0] || null,
    [squads, selectedSquadId]
  );

  // Load squad members for 1-on-1 DM switcher
  useEffect(() => {
    if (!activeSquad?.memberUids?.length) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    void fetchSquadMemberProfiles(activeSquad.memberUids)
      .then((profiles) => {
        if (!cancelled) {
          setMembers(profiles.filter((p) => p.uid !== currentUid));
        }
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSquad?.id, activeSquad?.memberUids, currentUid]);

  const activeChannel: ChatChannelRef | null = useMemo(() => {
    if (dmTarget && currentUid) {
      return { kind: 'dm', id: buildDmRoomId(currentUid, dmTarget.uid) };
    }
    if (activeSquad) {
      return { kind: 'squad', id: activeSquad.id };
    }
    return null;
  }, [dmTarget, activeSquad, currentUid]);

  // Subscribe to real-time messages & typing indicators
  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      setTypingUsers([]);
      setUnreadCount(0);
      return;
    }

    const unsubMsgs = subscribeStudyChatMessages(
      activeChannel,
      (nextMsgs) => {
        setMessages(nextMsgs);
        if (isOpen) {
          markChatRoomRead(currentUid, activeChannel);
          setUnreadCount(0);
        } else {
          const lastRead = getLastReadTimestamp(currentUid, activeChannel);
          const unread = nextMsgs.filter(
            (m) => m.senderId !== currentUid && (m.createdAt || 0) > lastRead
          ).length;
          setUnreadCount(unread);
        }
      },
      { isAuthenticated: Boolean(firebaseUser?.uid) }
    );

    const unsubTyping = subscribeStudyChatTyping(
      activeChannel,
      currentUid,
      setTypingUsers,
      { isAuthenticated: Boolean(firebaseUser?.uid) }
    );

    return () => {
      unsubMsgs();
      unsubTyping();
    };
  }, [activeChannel, currentUid, firebaseUser?.uid, isOpen]);

  // Mark read when opening drawer
  useEffect(() => {
    if (isOpen && activeChannel && currentUid) {
      markChatRoomRead(currentUid, activeChannel);
      setUnreadCount(0);
    }
  }, [isOpen, activeChannel, currentUid]);

  // Hide on Social tab (full chat already visible) or during fullscreen focus or if no squad
  if (fullScreenFocus || currentTab === 'social' || !activeChannel) {
    return null;
  }

  const handleSend = async (payload: SendMessagePayload) => {
    if (!activeChannel || !currentUid) return;
    await sendStudyChatMessage({
      channel: activeChannel,
      senderId: currentUid,
      senderName: currentName,
      ...payload,
      isAuthenticated: Boolean(firebaseUser?.uid),
    });
  };

  const handleReact = async (msg: StudyChatMessage, emoji: string) => {
    if (!activeChannel || !currentUid) return;
    await toggleStudyChatReaction({
      channel: activeChannel,
      message: msg,
      emoji,
      userId: currentUid,
      isAuthenticated: Boolean(firebaseUser?.uid),
    });
  };

  const handleJoinSprint = (durationMinutes: number) => {
    setTimerEngine('pomodoro');
    switchTimerMode('work', durationMinutes);
    startTimer();
    setIsOpen(false);
    setCurrentTab('focus');
    showToast(`Joined ${durationMinutes}m Deep Focus sprint!`, 'success');
  };

  const handleStartCall = async (mode: 'audio' | 'video') => {
    if (!activeChannel || callingMode) return;
    setCallingMode(mode);
    try {
      const res = await startOrJoinGoogleMeetCall({
        roomKey: activeChannel.id,
        mode,
        loginHint: firebaseUser?.email || undefined,
      });
      window.open(res.meetingUri, '_blank', 'noopener,noreferrer');
      const label = mode === 'audio' ? '🎙️ Voice Call started' : '📹 Video Call started';
      await handleSend({
        text: `${label} — Join Google Meet: ${res.meetingUri}`,
        messageType: 'call_link',
        metadata: { meetingUri: res.meetingUri },
      });
    } catch (err: any) {
      showToast(err?.message || 'Unable to start call right now.', 'error');
    } finally {
      setCallingMode(null);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2.5">
      {isOpen && (
        <div className="w-[340px] sm:w-[375px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Channel Switcher Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--ff-surface-muted)] border-b border-[var(--ff-border-color)]">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {squads.map((sq) => {
                const active = !dmTarget && activeSquad?.id === sq.id;
                return (
                  <button
                    key={sq.id}
                    type="button"
                    onClick={() => {
                      setDmTarget(null);
                      setSelectedSquadId(sq.id);
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[var(--ff-accent)] text-white'
                        : 'bg-white/5 text-[var(--ff-text-secondary)] hover:bg-white/10'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>{sq.name}</span>
                  </button>
                );
              })}
              {members.map((member) => {
                const active = dmTarget?.uid === member.uid;
                return (
                  <button
                    key={member.uid}
                    type="button"
                    onClick={() => setDmTarget(member)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/5 text-[var(--ff-text-secondary)] hover:bg-white/10'
                    }`}
                    title={`Direct message ${member.displayName}`}
                  >
                    <User className="w-3 h-3" />
                    <span>{member.displayName.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-white/10 shrink-0"
              aria-label="Close mini chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <StudyChat
            messages={messages}
            currentUserId={currentUid}
            title={dmTarget ? dmTarget.displayName : activeSquad?.name || 'Squad Chat'}
            subtitle={dmTarget ? 'Direct Message (1-on-1)' : 'Live Squad Conversation'}
            typingUsers={typingUsers}
            isRecipientInFocus={isInDeepFocus}
            compact
            onSend={handleSend}
            onReact={handleReact}
            onTypingChange={(typing) => {
              if (!activeChannel || !currentUid) return;
              void setStudyChatTyping({
                channel: activeChannel,
                uid: currentUid,
                displayName: currentName,
                isTyping: typing,
                isAuthenticated: Boolean(firebaseUser?.uid),
              });
            }}
            onJoinSprint={handleJoinSprint}
            onStartCall={handleStartCall}
            callingMode={callingMode}
          />
        </div>
      )}

      {/* Floating Launcher Pill */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`relative inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full shadow-lg border transition-all ${
          isInDeepFocus
            ? 'bg-slate-900/85 border-amber-500/40 text-amber-200 hover:bg-slate-900'
            : 'bg-[var(--ff-accent)] border-indigo-400/50 text-white hover:opacity-95'
        }`}
        title={isInDeepFocus ? 'Focus-Safe Chat (Quiet Mode)' : 'Open Quick Study Chat'}
        aria-label="Toggle Study Chat"
      >
        {isInDeepFocus ? (
          <BellOff className="w-4 h-4 text-amber-300" />
        ) : (
          <MessageSquare className="w-4 h-4" />
        )}
        <span className="text-xs font-bold hidden sm:inline">
          {isInDeepFocus ? 'Quiet Chat' : 'Squad Chat'}
        </span>
        {unreadCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

export default FloatingMiniChat;
