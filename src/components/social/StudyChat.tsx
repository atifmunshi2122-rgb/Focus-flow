import React, { useState, type FormEvent } from 'react';
import { Phone, Video } from 'lucide-react';
import type { StudyChatMessage } from '../../features/social/squad-types.ts';
import './StudyChat.css';

interface StudyChatProps {
  messages: StudyChatMessage[];
  currentUserId: string;
  onSend: (text: string) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onStartCall?: (mode: 'audio' | 'video') => Promise<void> | void;
  callingMode?: 'audio' | 'video' | null;
  loading?: boolean;
}

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
        className="underline font-semibold text-emerald-300 hover:text-emerald-200"
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
  onSend,
  onReact,
  onStartCall,
  callingMode = null,
  loading = false,
}: StudyChatProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending || text.length > 1000) return;

    try {
      setSending(true);
      await onSend(text);
      setMessage('');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="study-chat">
      <header className="study-chat-header flex items-center justify-between gap-2">
        <div>
          <h3>Study Chat</h3>
          <span>Group Conversation</span>
        </div>
        {onStartCall && (
          <div className="flex items-center gap-1.5 shrink-0">
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
          </div>
        )}
      </header>

      <div className="study-chat-messages" aria-live="polite">
        {loading && messages.length === 0 && <p className="chat-empty">Loading messages...</p>}

        {!loading && messages.length === 0 && (
          <p className="chat-empty">Start your squad conversation.</p>
        )}

        {messages.map((item) => {
          const own = item.senderId === currentUserId;
          return (
            <article key={item.id} className={`chat-message ${own ? 'own-message' : ''}`}>
              <div className="chat-message-author">
                {item.senderName} ·{' '}
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              <div className="chat-message-bubble">
                {item.deletedAt ? 'This message was deleted.' : renderMessageWithMeetLinks(item.text)}
              </div>

              {!item.deletedAt && (
                <div className="chat-message-actions">
                  {(['👍', '❤️', '🔥'] as const).map((emoji) => {
                    const count = item.reactionCounts?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void onReact(item.id, emoji)}
                        aria-label={`React with ${emoji}`}
                      >
                        {emoji}
                        {count > 0 ? ` ${count}` : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <form className="study-chat-composer" onSubmit={handleSubmit}>
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1000}
          placeholder="Write a message..."
          aria-label="Chat message"
        />

        <button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </section>
  );
}

