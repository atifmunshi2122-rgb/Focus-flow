import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BellOff,
  CornerUpLeft,
  Phone,
  Play,
  Send,
  Sparkles,
  Timer,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type {
  StudyChatMessage,
  StudyChatMessageType,
} from '../../features/social/squad-types.ts';
import type { TypingUser } from '../../lib/studyChatService.ts';
import './StudyChat.css';

export interface SendMessagePayload {
  text: string;
  messageType?: StudyChatMessageType;
  deliverOnBreak?: boolean;
  replyToId?: string;
  replyPreview?: { senderName: string; text: string };
  metadata?: StudyChatMessage['metadata'];
}

interface StudyChatProps {
  messages: StudyChatMessage[];
  currentUserId: string;
  title?: string;
  subtitle?: string;
  typingUsers?: TypingUser[];
  isRecipientInFocus?: boolean;
  compact?: boolean;
  onSend: (payload: SendMessagePayload) => Promise<void>;
  onReact: (message: StudyChatMessage, emoji: string) => Promise<void>;
  onDeleteMessage?: (message: StudyChatMessage) => Promise<void>;
  onClearChat?: () => Promise<void>;
  onTypingChange?: (isTyping: boolean) => void;
  onJoinSprint?: (durationMinutes: number, subjectCode?: string) => void;
  onStartCall?: (mode: 'audio' | 'video') => Promise<void> | void;
  callingMode?: 'audio' | 'video' | null;
  loading?: boolean;
}

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '💡', '🎯'] as const;

function renderMessageWithMeetLinks(text: string): React.ReactNode {
  const urlMatch = text.match(/(https:\/\/meet\.google\.com\/[^\s]+)/i);
  if (!urlMatch) return text;
  const url = urlMatch[1];
  const idx = text.indexOf(url);
  const before = text.slice(0, idx);
  const after = text.slice(idx + url.length);
  return (
    <>
      {before}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-semibold text-emerald-300 hover:text-emerald-200 break-all"
      >
        {url}
      </a>
      {after}
    </>
  );
}

export default function StudyChat({
  messages,
  currentUserId,
  title = 'Study Chat',
  subtitle = 'Real-Time Conversation',
  typingUsers = [],
  isRecipientInFocus = false,
  compact = false,
  onSend,
  onReact,
  onDeleteMessage,
  onClearChat,
  onTypingChange,
  onJoinSprint,
  onStartCall,
  callingMode = null,
  loading = false,
}: StudyChatProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [deliverOnBreak, setDeliverOnBreak] = useState(false);
  const [replyingTo, setReplyingTo] = useState<StudyChatMessage | null>(null);
  const [revealHeldDuringFocus, setRevealHeldDuringFocus] = useState(false);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // Reset reveal state when exiting focus
  useEffect(() => {
    if (!isRecipientInFocus) {
      setRevealHeldDuringFocus(false);
    }
  }, [isRecipientInFocus]);

  // Separate held "Deliver on Break" messages from others when current user is in Deep Focus
  const heldMessages = isRecipientInFocus && !revealHeldDuringFocus
    ? messages.filter((m) => m.deliverOnBreak && m.senderId !== currentUserId)
    : [];
  const visibleMessages = isRecipientInFocus && !revealHeldDuringFocus
    ? messages.filter((m) => !(m.deliverOnBreak && m.senderId !== currentUserId))
    : messages;

  // Auto-scroll to newest message
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleMessages.length]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      onTypingChange?.(false);
    };
  }, [onTypingChange]);

  const handleInputChange = (val: string) => {
    setMessage(val);
    if (!onTypingChange) return;
    onTypingChange(val.trim().length > 0);
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 3000);
  };

  async function dispatchSend(payload: SendMessagePayload) {
    if (sending) return;
    try {
      setSending(true);
      onTypingChange?.(false);
      await onSend(payload);
      setMessage('');
      setReplyingTo(null);
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending || text.length > 1000) return;

    await dispatchSend({
      text,
      messageType: 'text',
      deliverOnBreak,
      replyToId: replyingTo?.id,
      replyPreview: replyingTo
        ? { senderName: replyingTo.senderName, text: replyingTo.text.slice(0, 120) }
        : undefined,
    });
  }

  const handleSendSprintInvite = () => {
    void dispatchSend({
      text: '🎯 Starting a 25m Deep Focus sprint — click Join to sync your Pomodoro timer!',
      messageType: 'pomodoro_invite',
      deliverOnBreak,
      metadata: { durationMinutes: 25 },
    });
  };

  const handleSendNudge = () => {
    void dispatchSend({
      text: '⚡ Quick study nudge — ready for the next focus block?',
      messageType: 'nudge',
      deliverOnBreak: true,
    });
  };

  return (
    <section
      className="study-chat"
      style={compact ? { minHeight: '340px', maxHeight: '420px', padding: '0.75rem' } : undefined}
    >
      <header className="study-chat-header flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate">{title}</h3>
          <span className="truncate block">{subtitle}</span>
        </div>
        {(onStartCall || (onClearChat && messages.length > 0)) && (
          <div className="flex items-center gap-1.5 shrink-0">
            {onStartCall && (
              <>
                <button
                  type="button"
                  disabled={Boolean(callingMode)}
                  onClick={() => void onStartCall('audio')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                  title="Start Voice Call (Google Meet)"
                  aria-label="Voice Call"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{callingMode === 'audio' ? 'Joining...' : 'Call'}</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(callingMode)}
                  onClick={() => void onStartCall('video')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 hover:bg-indigo-500/35 disabled:opacity-50 transition-colors"
                  title="Start Video Call (Google Meet)"
                  aria-label="Video Call"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>{callingMode === 'video' ? 'Starting...' : 'Video'}</span>
                </button>
              </>
            )}
            {onClearChat && messages.length > 0 && (
              <button
                type="button"
                onClick={() => void onClearChat()}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-400/35 hover:bg-rose-500/25 transition-colors"
                title="Clear chat for everyone"
                aria-label="Clear Chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {!compact && <span>Clear</span>}
              </button>
            )}
          </div>
        )}
      </header>

      {/* Focus-Safe Break-Only Quiet Banner */}
      {heldMessages.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-500/12 border border-amber-500/30 text-[11px] text-amber-200">
          <span className="inline-flex items-center gap-1.5">
            <BellOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>{heldMessages.length}</strong> focus-safe message
              {heldMessages.length > 1 ? 's' : ''} held for your break
            </span>
          </span>
          <button
            type="button"
            onClick={() => setRevealHeldDuringFocus(true)}
            className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-semibold text-amber-100 shrink-0"
          >
            Show now
          </button>
        </div>
      )}

      <div className="study-chat-messages" aria-live="polite">
        {loading && visibleMessages.length === 0 && (
          <p className="chat-empty">Loading messages...</p>
        )}

        {!loading && visibleMessages.length === 0 && (
          <p className="chat-empty">
            Start your conversation — share a message, send a 25m Sprint Invite, or nudge your squad.
          </p>
        )}

        {visibleMessages.map((item) => {
          const own = item.senderId === currentUserId;
          const isSprintInvite = item.messageType === 'pomodoro_invite';
          const isNudge = item.messageType === 'nudge';

          return (
            <article key={item.id} className={`chat-message ${own ? 'own-message' : ''}`}>
              <div className="chat-message-author flex items-center gap-1.5">
                <span>
                  {item.senderName} ·{' '}
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {item.deliverOnBreak && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[10px]"
                    title="Focus-safe: delivered quietly on break"
                  >
                    <BellOff className="w-2.5 h-2.5" />
                    Break-only
                  </span>
                )}
              </div>

              <div
                className={`chat-message-bubble ${
                  isSprintInvite
                    ? '!bg-indigo-600/25 !border !border-indigo-400/45'
                    : isNudge
                    ? '!bg-amber-500/15 !border !border-amber-400/35'
                    : ''
                }`}
              >
                {item.replyPreview && (
                  <div className="mb-1.5 px-2 py-1 rounded-lg bg-black/25 border-l-2 border-indigo-400 text-[11px] opacity-85">
                    <div className="font-semibold text-indigo-300 text-[10px]">
                      {item.replyPreview.senderName}
                    </div>
                    <div className="truncate">{item.replyPreview.text}</div>
                  </div>
                )}

                {item.deletedAt ? (
                  'This message was deleted.'
                ) : (
                  <div className="space-y-2">
                    <div>{renderMessageWithMeetLinks(item.text)}</div>
                    {isSprintInvite && onJoinSprint && (
                      <button
                        type="button"
                        onClick={() =>
                          onJoinSprint(
                            item.metadata?.durationMinutes || 25,
                            item.metadata?.subjectCode
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Join {item.metadata?.durationMinutes || 25}m Focus</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {!item.deletedAt && (
                <div className="chat-message-actions">
                  {REACTION_EMOJIS.map((emoji) => {
                    const count = item.reactionCounts?.[emoji] || 0;
                    const userReacted = Boolean(
                      item.reactionUsers?.[emoji]?.includes(currentUserId)
                    );
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void onReact(item, emoji)}
                        aria-label={`React with ${emoji}`}
                        style={
                          userReacted
                            ? {
                                background: 'rgba(99, 102, 241, 0.28)',
                                borderColor: 'rgba(129, 140, 248, 0.5)',
                              }
                            : undefined
                        }
                      >
                        {emoji}
                        {count > 0 ? ` ${count}` : ''}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setReplyingTo(item)}
                    title="Reply to message"
                    aria-label="Reply"
                  >
                    <CornerUpLeft className="w-3 h-3 inline mr-0.5" />
                    Reply
                  </button>
                  {own && onDeleteMessage && (
                    <button
                      type="button"
                      onClick={() => void onDeleteMessage(item)}
                      title="Delete message for everyone"
                      aria-label="Delete message"
                      className="!text-rose-300 hover:!bg-rose-500/20"
                    >
                      <Trash2 className="w-3 h-3 inline mr-0.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {typingUsers.length > 0 && (
          <div className="text-[11px] text-indigo-300 italic px-1 animate-pulse">
            {typingUsers.map((u) => u.displayName).join(', ')}{' '}
            {typingUsers.length > 1 ? 'are' : 'is'} typing...
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Quick Study Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={sending}
            onClick={handleSendSprintInvite}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border border-indigo-400/30 transition-colors"
            title="Share an interactive 25m Pomodoro invite card"
          >
            <Timer className="w-3 h-3" />
            <span>25m Sprint</span>
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={handleSendNudge}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/30 transition-colors"
            title="Send a gentle focus nudge"
          >
            <Sparkles className="w-3 h-3" />
            <span>Nudge</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDeliverOnBreak((v) => !v)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
            deliverOnBreak
              ? 'bg-amber-500/25 text-amber-200 border-amber-400/50'
              : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'
          }`}
          title="Focus-Safe Mode: hold delivery until recipient takes a break"
        >
          <BellOff className="w-3 h-3" />
          <span>{deliverOnBreak ? 'Break-Only ON' : 'Break-Only'}</span>
        </button>
      </div>

      {/* Reply Preview Strip */}
      {replyingTo && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-[11px]">
          <div className="min-w-0">
            <span className="font-semibold text-indigo-300">
              Replying to {replyingTo.senderName}:{' '}
            </span>
            <span className="text-slate-300 truncate">{replyingTo.text.slice(0, 70)}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-0.5 rounded hover:bg-white/10 text-slate-300 shrink-0"
            aria-label="Cancel reply"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <form className="study-chat-composer" onSubmit={handleSubmit}>
        <input
          value={message}
          onChange={(event) => handleInputChange(event.target.value)}
          maxLength={1000}
          placeholder={
            deliverOnBreak
              ? 'Write a focus-safe message (delivered on break)...'
              : 'Write a message...'
          }
          aria-label="Chat message"
        />

        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="inline-flex items-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </form>
    </section>
  );
}
